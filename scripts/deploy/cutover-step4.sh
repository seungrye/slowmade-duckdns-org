#!/usr/bin/env bash
# 4단계: 트래픽 전환 후 정리.
# - screen 안의 3010 프로세스(기존 next-server) graceful 종료
# - webapp@3011 부팅 자동 시작 등록
#
# webapp@3010 은 .next-3010 빌드 산출물이 없어 enable 시 재부팅 후 실패.
# 첫 deploy.sh 실행 시 자동으로 enable --now 되도록 deploy.sh 가 처리한다.
set -euo pipefail

OLD_PORT=3010
NEW_PORT=3011

echo "[1/4] 3010 listen 프로세스 식별"
OLD_PID=$(ss -tlnp 2>/dev/null | awk -v p=":${OLD_PORT}" '
    $0 ~ p" " {
        match($0, /pid=[0-9]+/);
        print substr($0, RSTART+4, RLENGTH-4);
        exit
    }')
if [[ -z "${OLD_PID}" ]]; then
    echo "  → 3010 에 listen 중인 프로세스 없음 (이미 종료된 듯)"
else
    echo "  → pid=${OLD_PID}"
    PID_CMD=$(ps -p "$OLD_PID" -o cmd= 2>/dev/null || echo "")
    echo "  → cmd: ${PID_CMD}"
fi

echo "[2/4] SIGTERM 송신 + graceful 종료 대기"
if [[ -n "${OLD_PID}" ]]; then
    kill -TERM "${OLD_PID}" || true
    for i in {1..15}; do
        if ! kill -0 "${OLD_PID}" 2>/dev/null; then
            echo "  → ${i}s 안에 종료됨"
            break
        fi
        sleep 1
    done
    if kill -0 "${OLD_PID}" 2>/dev/null; then
        echo "  → 15s 후에도 살아있음, SIGKILL"
        kill -KILL "${OLD_PID}" || true
        sleep 1
    fi
fi

echo "[3/4] 포트 점유 확인"
ss -tlnp 2>/dev/null | grep -E ":(${OLD_PORT}|${NEW_PORT}) " | sed 's/^/  /' || true
if ss -tlnp 2>/dev/null | grep -qE ":${OLD_PORT} "; then
    echo "✗ 3010 이 여전히 점유 중. 수동 확인 필요." >&2
    exit 1
fi

echo "[4/4] webapp@${NEW_PORT} 부팅 자동 시작 등록"
sudo systemctl enable "webapp@${NEW_PORT}"

echo "  - systemd 상태:"
sudo systemctl is-active "webapp@${NEW_PORT}" | sed 's/^/    active: /'
sudo systemctl is-enabled "webapp@${NEW_PORT}" | sed 's/^/    enabled: /'

echo "  - 사이트 응답:"
curl -fsS -o /dev/null -w "    HTTP %{http_code}\n" https://slowmade.duckdns.org/

echo
echo "✓ 4단계 완료. 트래픽 단일 인스턴스(webapp@${NEW_PORT}) 로 안정화."
echo "   다음번 ./scripts/deploy/deploy.sh 실행 시 webapp@${OLD_PORT} 가 자동 등록됨."
