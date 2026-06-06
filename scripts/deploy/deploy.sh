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

main() {
    cd "$WEBAPP_DIR"

    local active inactive
    active=$(current_port)
    inactive=$(inactive_port "$active")
    log "active=$active  →  deploying to inactive=$inactive"

    # build 직전에 wasm 번들 보장.
    ensure_bevy_wasm

    log "build (NEXT_DISTDIR=.next-${inactive})"
    NEXT_DISTDIR=".next-${inactive}" pnpm install --frozen-lockfile
    NEXT_DISTDIR=".next-${inactive}" pnpm build

    log "systemctl enable --now webapp@${inactive}"
    # enable 도 함께 — 첫 배포에서 인스턴스를 부팅 자동 시작 대상에 등록.
    sudo systemctl enable --now "webapp@${inactive}"

    log "health check http://127.0.0.1:${inactive}${HEALTH_PATH} (timeout=${HEALTH_TIMEOUT_SEC}s)"
    if ! health_check "$inactive"; then
        warn "health check FAILED — rolling back"
        sudo systemctl stop "webapp@${inactive}" || true
        die "deploy aborted: new instance on port ${inactive} did not become healthy"
    fi
    log "new instance healthy"

    log "swap upstream → ${inactive} and reload nginx"
    write_upstream "$inactive"
    sudo nginx -t
    sudo nginx -s reload

    log "stop old instance webapp@${active}"
    sudo systemctl stop "webapp@${active}" || warn "old instance stop failed (already stopped?)"

    log "✓ deploy complete: traffic now on ${inactive}"
}

main "$@"
