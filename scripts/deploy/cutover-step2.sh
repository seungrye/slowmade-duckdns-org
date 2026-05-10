#!/usr/bin/env bash
# 2단계: webapp@3011 systemd 인스턴스 기동 + /api/health 폴링.
# 트래픽 영향 없음(upstream 은 여전히 3010 의 screen 프로세스를 가리킴).
set -euo pipefail

PORT=3011
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
TIMEOUT=60
INTERVAL=2

trap 'echo; echo "=== journalctl -u webapp@${PORT} (마지막 50 줄) ==="; \
      sudo journalctl -u "webapp@${PORT}" -n 50 --no-pager 2>&1 | tail -50' ERR

echo "[1/3] webapp@${PORT} 시작"
sudo systemctl start "webapp@${PORT}"
sleep 2
sudo systemctl is-active "webapp@${PORT}"

echo "[2/3] 헬스체크 폴링 (timeout=${TIMEOUT}s)"
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

echo "[3/3] 포트 점유 상태"
ss -tlnp 2>/dev/null | grep -E ':(3010|3011)' | sed 's/^/  /'

echo
echo "✓ 2단계 완료. 3011 인스턴스 정상 동작. 트래픽은 아직 3010(screen) 으로 흐름."
