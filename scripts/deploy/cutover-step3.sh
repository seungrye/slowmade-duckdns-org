#!/usr/bin/env bash
# 3단계: nginx upstream 을 3010 → 3011 로 스왑 + graceful reload.
# 트래픽이 systemd webapp@3011 인스턴스로 전환된다.
# screen 의 3010 프로세스는 살려둠 — 문제 발생 시 sed 반대로 돌리면 즉시 롤백.
set -euo pipefail

UPSTREAM=/etc/nginx/conf.d/webapp-upstream.conf

echo "[1/5] 현재 upstream 설정"
grep -E '127\.0\.0\.1:[0-9]+' "$UPSTREAM" | sed 's/^/  /'

echo "[2/5] upstream 을 3011 로 변경"
sudo sed -i.bak 's|127\.0\.0\.1:3010|127.0.0.1:3011|' "$UPSTREAM"
grep -E '127\.0\.0\.1:[0-9]+' "$UPSTREAM" | sed 's/^/  /'

echo "[3/5] nginx 설정 검증"
sudo nginx -t

echo "[4/5] nginx 무중단 reload"
sudo nginx -s reload

echo "[5/5] 검증 (외부 도메인 + 헬스체크 + webapp@3011 액세스 로그)"
echo "  - 사이트 응답:"
curl -fsS -o /dev/null -w "    HTTP %{http_code}\n" https://slowmade.duckdns.org/
echo "  - 헬스체크 (외부):"
curl -fsS -w "\n" https://slowmade.duckdns.org/api/health | sed 's/^/    /'
echo "  - webapp@3011 최근 로그(요청이 도달했는지):"
sudo journalctl -u webapp@3011 -n 10 --no-pager 2>&1 | tail -10 | sed 's/^/    /'

echo
echo "✓ 3단계 완료. 트래픽이 webapp@3011(systemd) 로 전환됨."
echo "   screen 의 3010 은 아직 살아있음 — 문제 시 즉시 롤백 가능:"
echo "   sudo sed -i 's|127\\.0\\.0\\.1:3011|127.0.0.1:3010|' $UPSTREAM"
echo "   sudo nginx -s reload"
