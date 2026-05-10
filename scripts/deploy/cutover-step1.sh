#!/usr/bin/env bash
# 무중단 배포 최초 셋업 — 1단계: systemd 유닛 설치, nginx upstream 배치, proxy_pass 전환.
# 트래픽 영향 없음(upstream 이 여전히 3010 의 screen 프로세스를 가리킴).
set -euo pipefail

REPO=/home/seungrye/site
BACKUP_TS=$(date +%Y%m%d-%H%M%S)

echo "[1/7] systemd 유닛 설치"
sudo install -m 0644 "$REPO/scripts/deploy/webapp@.service" /etc/systemd/system/webapp@.service
sudo systemctl daemon-reload

echo "[2/7] nginx upstream 파일 배치"
sudo install -m 0644 "$REPO/scripts/deploy/webapp-upstream.conf" /etc/nginx/conf.d/webapp-upstream.conf

echo "[3/7] 사이트 설정 백업"
sudo cp /etc/nginx/sites-available/slowmade.duckdns.org \
        "/etc/nginx/sites-available/slowmade.duckdns.org.bak.${BACKUP_TS}"

echo "[4/7] proxy_pass http://localhost:3010 → http://webapp"
sudo sed -i 's|proxy_pass http://localhost:3010;|proxy_pass http://webapp;|' \
    /etc/nginx/sites-available/slowmade.duckdns.org

echo "[5/7] nginx 설정 검증"
sudo nginx -t

echo "[6/7] nginx 무중단 reload"
sudo nginx -s reload

echo "[7/7] 검증"
echo "  - 외부 HTTP 응답:"
curl -fsS -o /dev/null -w "    HTTP %{http_code}\n" https://slowmade.duckdns.org/
echo "  - 변경된 proxy_pass / upstream 설정:"
grep -E 'proxy_pass|upstream webapp' \
    /etc/nginx/sites-available/slowmade.duckdns.org \
    /etc/nginx/conf.d/webapp-upstream.conf | sed 's/^/    /'

echo
echo "✓ 1단계 완료. 백업: /etc/nginx/sites-available/slowmade.duckdns.org.bak.${BACKUP_TS}"
