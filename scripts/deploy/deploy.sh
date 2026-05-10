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
HEALTH_PATH="/api/health"
HEALTH_TIMEOUT_SEC=60
HEALTH_INTERVAL_SEC=2

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

main() {
    cd "$WEBAPP_DIR"

    local active inactive
    active=$(current_port)
    inactive=$(inactive_port "$active")
    log "active=$active  →  deploying to inactive=$inactive"

    log "build (NEXT_DISTDIR=.next-${inactive})"
    NEXT_DISTDIR=".next-${inactive}" pnpm install --frozen-lockfile
    NEXT_DISTDIR=".next-${inactive}" pnpm build

    log "systemctl start webapp@${inactive}"
    sudo systemctl start "webapp@${inactive}"

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
