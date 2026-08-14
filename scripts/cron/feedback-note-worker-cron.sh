#!/usr/bin/env bash
# 에테르니아 피드백 노트 큐 워커 드레인 (#9). host cron 이 1분마다 호출.
#
# - 활성 webapp 포트(Blue/Green upstream)로 **직접** 호출 → nginx 60s proxy timeout 우회
#   (LLM 생성은 수 분~십수 분 걸림, 워커 route maxDuration=1800).
# - flock 으로 중복 실행 방지: 생성이 진행 중이면(이전 curl 이 락 보유) 이번 tick 은 skip.
#   워커 엔드포인트 자체도 processing>0 이면 즉시 no-op 이라 이중 안전.
# - 인증: .env.local 의 STOCK_INGEST_KEY 를 x-worker-key 로 전달(워커 route 폴백 키).
set -u
exec 9>/tmp/fbnote-worker.lock || exit 0
flock -n 9 || exit 0

PORT=$(grep -oE '127\.0\.0\.1:[0-9]+' /etc/nginx/conf.d/webapp-upstream.conf 2>/dev/null | head -1 | cut -d: -f2)
[ -z "$PORT" ] && exit 0
KEY=$(grep -E '^STOCK_INGEST_KEY=' /home/seungrye/site/webapp/.env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'")
[ -z "$KEY" ] && exit 0

curl -sS -m 2820 -X POST -H "x-worker-key: $KEY" \
  "http://127.0.0.1:${PORT}/api/web-adventure/feedback-notes/worker" >/dev/null 2>&1
