#!/usr/bin/env bash
# 에테르니아 씬 삽화 큐 워커 드레인 (#158). host cron 이 1분마다 호출.
#
# 피드백 노트 워커 cron 과 같은 구조다:
# - 활성 webapp 포트(Blue/Green upstream)로 **직접** 호출 → nginx 60s proxy timeout 우회.
# - flock 으로 중복 실행 방지. 워커 엔드포인트도 processing>0 이면 즉시 no-op(이중 안전).
# - 인증: .env.local 의 STOCK_INGEST_KEY 를 x-worker-key 로 전달.
#
# 배치: 이 파일을 ~/bin/ 으로 복사하고 crontab 에 1분 주기로 등록한다.
#   install -m 0755 scripts/cron/scene-image-worker-cron.sh ~/bin/
#   (crontab) * * * * * /home/seungrye/bin/scene-image-worker-cron.sh
set -u
exec 9>/tmp/scene-image-worker.lock || exit 0
flock -n 9 || exit 0

PORT=$(grep -oE '127\.0\.0\.1:[0-9]+' /etc/nginx/conf.d/webapp-upstream.conf 2>/dev/null | head -1 | cut -d: -f2)
[ -z "$PORT" ] && exit 0
KEY=$(grep -E '^STOCK_INGEST_KEY=' /home/seungrye/site/webapp/.env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'")
[ -z "$KEY" ] && exit 0

curl -sS -m 300 -X POST -H "x-worker-key: $KEY" \
  "http://127.0.0.1:${PORT}/api/web-adventure/scene-images/worker" >/dev/null 2>&1
