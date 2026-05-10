#!/usr/bin/env bash
# 2단계 재시도 — webapp@.service 의 ExecStart 를 pnpm start (포트 하드코딩) 에서
# pnpm exec next start -p %i 로 수정 후 재기동.
set -euo pipefail

PORT=3011
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
TIMEOUT=60
INTERVAL=2
REPO=/home/seungrye/site

echo "[1/5] 실패 중인 webapp@${PORT} 정지"
sudo systemctl stop "webapp@${PORT}" || true
# restart 루프가 설계한 RestartSec 동안 다시 뜨지 않도록 reset-failed.
sudo systemctl reset-failed "webapp@${PORT}" || true

echo "[2/5] 수정된 unit 파일 재설치"
sudo install -m 0644 "$REPO/scripts/deploy/webapp@.service" /etc/systemd/system/webapp@.service
sudo systemctl daemon-reload

echo "[3/5] webapp@${PORT} 시작"
sudo systemctl start "webapp@${PORT}"
sleep 2
sudo systemctl is-active "webapp@${PORT}"

echo "[4/5] 헬스체크 폴링 (timeout=${TIMEOUT}s)"
trap 'echo; echo "=== journalctl (마지막 50 줄) ==="; \
      sudo journalctl -u "webapp@${PORT}" -n 50 --no-pager 2>&1 | tail -50' ERR
elapsed=0
while (( elapsed < TIMEOUT )); do
    if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
        echo "  → 응답 OK ($(curl -fsS --max-time 3 "$HEALTH_URL"))"
        break
    fi
    sleep "$INTERVAL"
    elapsed=$((elapsed + INTERVAL))
    echo "  ... ${elapsed}s 대기"
done
if (( elapsed >= TIMEOUT )); then
    echo "✗ 헬스체크 타임아웃" >&2
    exit 1
fi

echo "[5/5] 포트 점유 상태"
ss -tlnp 2>/dev/null | grep -E ':(3010|3011)' | sed 's/^/  /'

echo
echo "✓ 2단계 완료. 3011 인스턴스 정상 동작. 트래픽은 아직 3010(screen) 으로 흐름."
