#!/usr/bin/env bash
# 야간 러너가 사이트와 이야기하는 **유일한 통로** (#215).
#
# ── 왜 래퍼가 필요한가 ──────────────────────────────────────────────────
#
# 처음엔 프롬프트가 curl 을 직접 부르게 했다. 그런데 첫날 밤 첫 명령에서 막혔다:
#
#   curl -sS -H "x-ai-team-key: $AI_TEAM_KEY" "$AI_TEAM_BASE_URL/api/..."
#   → Permission to use Bash has been denied
#
# 허용 규칙(`Bash(curl *)`)은 명령 문자열을 앞부분 매칭으로 검사하는데, **셸 변수 확장이
# 들어가면 무엇이 실행될지 정적으로 확인할 수 없어 거부**된다. 리터럴 URL 은 통과했다.
# 즉 러너 설계가 스스로와 어긋나 있었다 — 변수를 쓰라고 지시하면서 변수 쓴 명령을 막았다.
#
# 키를 명령줄에 리터럴로 박으면 돌아가지만, 그러면 **AI_TEAM_KEY 가 트랜스크립트와
# systemd 로그에 평문으로 남는다.** 그래서 래퍼로 뺐다 — 모델이 쓰는 명령에는 `$` 도
# 비밀도 등장하지 않고, 키는 이 스크립트가 환경에서 조용히 꺼내 쓴다.
#
# ── 왜 경로가 아니라 명령인가 ────────────────────────────────────────────
#
# `api.sh get <아무 경로>` 로 만들면 이 통로로 사이트의 **어느 엔드포인트든** 부를 수 있다.
# 할 수 있는 일을 셋으로 못박아 두면, 러너가 잘못 판단해도 그 셋 밖으로는 못 나간다.
#
# 사용:
#   api.sh threads
#   api.sh thread <postId>
#   api.sh comment <postId> <persona> <내용> [parentId]
set -euo pipefail

BASE="${AI_TEAM_BASE_URL:-https://handmade.r-e.kr}"
KEY="${AI_TEAM_KEY:-}"

die() { printf '%s\n' "$*" >&2; exit 2; }

[[ -n "$KEY" ]] || die "AI_TEAM_KEY 가 환경에 없습니다. run.sh 를 통해 실행하세요."

call() { curl -sS --max-time 30 -H "x-ai-team-key: $KEY" "$@"; }

cmd="${1:-}"
shift || true

case "$cmd" in
  threads)
    call "$BASE/api/ai-team/threads"
    ;;

  thread)
    id="${1:-}"
    [[ -n "$id" ]] || die "사용법: api.sh thread <postId>"
    call --get --data-urlencode "postId=$id" "$BASE/api/ai-team/thread"
    ;;

  comment)
    id="${1:-}"; persona="${2:-}"; body="${3:-}"; parent="${4:-}"
    [[ -n "$id" && -n "$persona" && -n "$body" ]] \
      || die "사용법: api.sh comment <postId> <persona> <내용> [parentId]"
    # 본문에는 따옴표·개행·한글이 들어온다. JSON 조립을 손으로 하면 반드시 깨진다.
    payload="$(
      AT_ID="$id" AT_PERSONA="$persona" AT_BODY="$body" AT_PARENT="$parent" python3 -c '
import json, os
d = {"postId": os.environ["AT_ID"],
     "persona": os.environ["AT_PERSONA"],
     "content": os.environ["AT_BODY"]}
if os.environ.get("AT_PARENT"):
    d["parentId"] = os.environ["AT_PARENT"]
print(json.dumps(d, ensure_ascii=False))
'
    )"
    call -X POST -H 'Content-Type: application/json' -d "$payload" "$BASE/api/ai-team/comment"
    ;;

  *)
    die "알 수 없는 명령: '${cmd}'. threads | thread | comment 중 하나여야 합니다."
    ;;
esac
