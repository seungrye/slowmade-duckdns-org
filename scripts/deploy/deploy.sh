#!/usr/bin/env bash
# 무중단 배포 — Blue/Green + nginx upstream 스왑.
#
# 동작:
#   1. 현재 활성 포트(upstream 파일) 읽기 → 비활성 포트 결정
#   2. 비활성 포트의 distDir 로 빌드
#   3. 비활성 포트의 systemd 인스턴스 시작
#   4. /api/health 폴링 — 타임아웃 시 비활성 인스턴스 정리하고 실패
#   5. upstream 파일을 비활성 포트로 갱신 → nginx -s reload (graceful)
#   6. 구 활성 포트 인스턴스 stop
#
# 전제:
#   - systemd 템플릿 유닛 webapp@.service 가 /etc/systemd/system/ 에 설치됨
#   - /etc/nginx/conf.d/webapp-upstream.conf 가 이 저장소의 파일을 가리키거나 동기화됨
#   - nginx config 의 location 블록이 `proxy_pass http://webapp;` 를 사용
#   - 사용자가 sudo 비밀번호 없이 다음 명령을 실행할 수 있어야 함:
#       systemctl start/stop/is-active webapp@<port>
#       nginx -s reload (또는 systemctl reload nginx)
#       cp <repo>/scripts/deploy/webapp-upstream.conf <target>
#     /etc/sudoers.d/ 에 NOPASSWD 룰 등록 권장.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
WEBAPP_DIR="$REPO_DIR/webapp"
UPSTREAM_SRC="$REPO_DIR/scripts/deploy/webapp-upstream.conf"
UPSTREAM_DST="${WEBAPP_UPSTREAM_DST:-/etc/nginx/conf.d/webapp-upstream.conf}"
PORT_BLUE=3010
PORT_GREEN=3011
HEALTH_PATH="/api/health?deep=true"  # #282 — mongo ping 까지 검사.
HEALTH_TIMEOUT_SEC=60
HEALTH_INTERVAL_SEC=2

# bevy-rogue WASM 산출물 위치/소스 repo 경로.
BEVY_ROGUE_PATH="${BEVY_ROGUE_PATH:-/home/seungrye/bevy-rogue}"
BEVY_WASM_DEST="$WEBAPP_DIR/public/games/bevy-rogue"

# --rebuild-wasm 옵션 파싱 (단순 — 첫 인자만 본다).
REBUILD_WASM=0
for arg in "$@"; do
    case "$arg" in
        --rebuild-wasm) REBUILD_WASM=1 ;;
    esac
done

log()  { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[deploy]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

current_port() {
    # upstream conf 에서 활성 포트 읽기. 파일이 없거나 매치 실패면 BLUE 로 가정.
    if [[ -r "$UPSTREAM_DST" ]]; then
        local p
        p=$(grep -oE '127\.0\.0\.1:[0-9]+' "$UPSTREAM_DST" | head -1 | cut -d: -f2 || true)
        if [[ "$p" == "$PORT_BLUE" || "$p" == "$PORT_GREEN" ]]; then
            echo "$p"; return
        fi
    fi
    echo "$PORT_BLUE"
}

inactive_port() {
    if [[ "$1" == "$PORT_BLUE" ]]; then echo "$PORT_GREEN"; else echo "$PORT_BLUE"; fi
}

write_upstream() {
    local port=$1
    local tmp; tmp=$(mktemp)
    sed "s/127\\.0\\.0\\.1:[0-9]\\+/127.0.0.1:${port}/" "$UPSTREAM_SRC" > "$tmp"
    sudo install -m 0644 "$tmp" "$UPSTREAM_DST"
    rm -f "$tmp"
    # 검증: DST 가 실제로 새 포트로 반영됐는지 되읽어 확인(간헐적 미갱신 방어).
    # 이게 어긋난 채 구 인스턴스를 멈추면 nginx 가 죽은 포트로 붙어 전체 502 가 난다.
    # 반영 실패 시 non-zero 리턴 → 호출측이 구 인스턴스 정지 전에 중단한다.
    local now
    now=$(grep -oE '127\.0\.0\.1:[0-9]+' "$UPSTREAM_DST" | head -1 | cut -d: -f2 || true)
    [[ "$now" == "$port" ]]
}

health_check() {
    local port=$1
    local elapsed=0
    while (( elapsed < HEALTH_TIMEOUT_SEC )); do
        if curl -fsS --max-time 3 "http://127.0.0.1:${port}${HEALTH_PATH}" >/dev/null 2>&1; then
            return 0
        fi
        sleep "$HEALTH_INTERVAL_SEC"
        elapsed=$((elapsed + HEALTH_INTERVAL_SEC))
    done
    return 1
}

# 인스턴스의 현재 MainPID. 멈춰 있으면 0, 유닛이 없으면 빈 문자열.
#
# 재시작이 **실제로 일어났는지** 재는 데 쓴다. 살아 있나만 보는 health check 로는
# "옛 프로세스가 새 빌드 디렉터리를 들고 서빙" 하는 상태를 구분하지 못한다(#263).
instance_pid() {
    # `set -euo pipefail` 아래다 — 유닛이 없어 systemctl 이 실패해도 **배포를 죽이면 안 된다.**
    # 못 읽으면 빈 문자열로 두고, 판정은 호출측이 한다.
    local out=""
    out=$(systemctl show "webapp@$1" --property=MainPID --value 2>/dev/null) || out=""
    printf '%s' "${out//[[:space:]]/}"
}

ensure_bevy_wasm() {
    # bevy-rogue WASM 번들이 public/games/bevy-rogue/ 에 있는지 검사.
    # 핵심 파일(bevy_rogue.js + bevy_rogue_bg.wasm) 둘 다 있어야 OK.
    #
    # 동작:
    #   - --rebuild-wasm 또는 PUBLISH_WASM=1 → 무조건 publish-to-site.sh 호출.
    #   - 핵심 파일이 둘 다 있으면 OK 메시지만.
    #   - 없으면 자동으로 publish-to-site.sh 호출(사용자 편의).
    #     스크립트도 없으면 명확한 안내 후 실패.
    #
    # 설계 이유:
    #   blue/green 무중단 배포 흐름은 "한 번 실행하면 끝까지 간다" 가 자연스럽다.
    #   누락 시 실패로 멈추면 운영자가 별도 publish 후 재실행해야 해 번거롭다.
    #   bevy-rogue repo 가 있고 wasm-build.sh 가 동작하면 자동 publish 가 안전한 기본값.
    local publish_script="$BEVY_ROGUE_PATH/scripts/publish-to-site.sh"
    local has_glue=0 has_wasm=0
    [[ -f "$BEVY_WASM_DEST/bevy_rogue.js" ]] && has_glue=1
    [[ -f "$BEVY_WASM_DEST/bevy_rogue_bg.wasm" ]] && has_wasm=1

    if [[ "$REBUILD_WASM" == "1" || "${PUBLISH_WASM:-0}" == "1" ]]; then
        log "wasm 강제 재빌드/배포 (--rebuild-wasm 또는 PUBLISH_WASM=1)"
        [[ -x "$publish_script" ]] || die "publish 스크립트 없음: $publish_script (BEVY_ROGUE_PATH 확인)"
        SITE_PATH="$REPO_DIR" bash "$publish_script"
        return
    fi

    if (( has_glue && has_wasm )); then
        log "bevy-rogue wasm 산출물 확인됨: $BEVY_WASM_DEST"
        return
    fi

    warn "bevy-rogue wasm 산출물 누락 — 자동 publish 시도"
    if [[ ! -x "$publish_script" ]]; then
        die "publish 스크립트 없음: $publish_script
        해결: BEVY_ROGUE_PATH=<bevy-rogue repo 경로> 설정 후 재실행하거나,
        bevy-rogue repo 에서 'bash scripts/publish-to-site.sh' 를 먼저 실행하라.
        또는 git 에서 webapp/public/games/bevy-rogue/ 가 제외(.gitignore)되어 있으니
        deploy 호스트에 bevy-rogue 빌드 환경이 필요하다."
    fi
    SITE_PATH="$REPO_DIR" bash "$publish_script"
}

ensure_retro_assets() {
    # 고전 게임 에뮬레이터(#109) 자산이 배치돼 있는지 본다.
    #
    # bevy 와 달리 **없어도 배포를 막지 않는다.** 게임 코너 하나 때문에 사이트 전체 배포가
    # 멈추면 안 되고, 앱도 자산이 없으면 목록을 감추고 설치 안내를 띄우도록 만들어 뒀다.
    # 자동 실행도 하지 않는다 — 수십 MB 를 내려받는 일이 배포 중에 조용히 벌어지면 곤란하다.
    if [[ -f "$WEBAPP_DIR/public/games/retro/data/loader.js" ]]; then
        log "retro 에뮬레이터 자산 확인됨"
    else
        warn "retro 에뮬레이터 자산 없음 — /games/retro 는 설치 안내만 표시됩니다.
        채우려면: bash scripts/games/fetch-emulatorjs.sh"
    fi
}

main() {
    cd "$WEBAPP_DIR"

    local active inactive
    active=$(current_port)
    inactive=$(inactive_port "$active")
    log "active=$active  →  deploying to inactive=$inactive"

    # build 직전에 wasm 번들 보장.
    ensure_bevy_wasm
    ensure_retro_assets

    log "build (NEXT_DISTDIR=.next-${inactive})"
    NEXT_DISTDIR=".next-${inactive}" pnpm install --frozen-lockfile
    NEXT_DISTDIR=".next-${inactive}" pnpm build

    # **`--now` 로는 부족하다** (#263). `--now` 는 **꺼져 있을 때만 켠다** — 이미 떠 있으면
    # 아무 일도 하지 않는다. 그래서 그 인스턴스가 어떤 이유로든 계속 떠 있었으면 **옛
    # 프로세스가 새 빌드 디렉터리를 그대로 들고 서빙한다.**
    #
    # #261 을 머지하고 배포했을 때 실제로 그랬다. "✓ deploy complete" 가 찍혔는데 새로
    # 넣은 라우트가 404 였다 — 빌드 산출물엔 route.js 가 있었고(13:42), webapp@3010 은
    # 어제(23:45) 뜬 프로세스 그대로였다. 빌드 ID 가 같아 겉으로 구분도 안 되고, health
    # check 도 통과한다(프로세스는 멀쩡히 살아 있으니).
    #
    # `restart` 는 꺼져 있으면 켜고 떠 있으면 다시 띄우므로 두 경우 모두 새 코드가 나간다.
    log "systemctl enable + restart webapp@${inactive}"
    # enable — 첫 배포에서 인스턴스를 부팅 자동 시작 대상에 등록.
    sudo systemctl enable "webapp@${inactive}"
    local pid_before pid_after
    pid_before=$(instance_pid "$inactive")
    sudo systemctl restart "webapp@${inactive}"
    pid_after=$(instance_pid "$inactive")

    # 재시작이 **실제로** 일어났는지 본다. 조용한 실패를 다시 겪지 않으려는 것이다.
    if [[ -z "$pid_after" || "$pid_after" == "0" ]]; then
        die "deploy aborted: webapp@${inactive} 가 뜨지 않았습니다 (MainPID=${pid_after:-none})."
    fi
    if [[ "$pid_before" == "$pid_after" ]]; then
        die "deploy aborted: webapp@${inactive} 가 재시작되지 않았습니다 (PID ${pid_before} 그대로) — 새 빌드가 안 나갑니다."
    fi
    log "restarted webapp@${inactive} (pid ${pid_before:-none} → ${pid_after})"

    log "health check http://127.0.0.1:${inactive}${HEALTH_PATH} (timeout=${HEALTH_TIMEOUT_SEC}s)"
    if ! health_check "$inactive"; then
        warn "health check FAILED — rolling back"
        sudo systemctl stop "webapp@${inactive}" || true
        die "deploy aborted: new instance on port ${inactive} did not become healthy"
    fi
    log "new instance healthy"

    log "swap upstream → ${inactive} and reload nginx"
    if ! write_upstream "$inactive"; then
        warn "새 인스턴스(${inactive})는 정상이나 upstream 파일이 ${inactive} 로 갱신되지 않음(간헐 버그)."
        warn "구 인스턴스(${active})·nginx 라우팅을 그대로 두어 서비스는 지속(새 코드는 미반영)."
        die "deploy aborted: upstream 갱신 실패 — ${UPSTREAM_DST} 수동 확인/수정 후 재시도. (새 인스턴스 webapp@${inactive} 는 계속 실행 중)"
    fi
    sudo nginx -t
    sudo nginx -s reload

    log "stop old instance webapp@${active}"
    sudo systemctl stop "webapp@${active}" || warn "old instance stop failed (already stopped?)"

    log "✓ deploy complete: traffic now on ${inactive}"
}

main "$@"
