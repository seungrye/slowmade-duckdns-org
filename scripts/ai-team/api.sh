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
#   api.sh comment <postId> <persona> --file <경로> [parentId]   ← 소제목이 든 본문은 이쪽
#   api.sh done <postId>              ← 끝난 요청 닫기 (#222)
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
    # ── 본문을 파일로 받는다 (#314) ──────────────────────────────────────
    #
    # 러너를 띄우는 쪽의 명령 해석기가 **줄 첫머리 우물정자를 주석 시작으로 본다.** 따옴표
    # 안이라도 그렇다. 그래서 `## 무엇` 같은 소제목이 둘째 줄부터 들어간 덧글은 통째로
    # 거부됐다 — `api.sh` 가 아니라 `git log --grep` 에 같은 본문을 넣어도 같았다.
    #
    # 안내문(`run.sh`)은 정작 그 형식으로 쓰라고 시키고 있었다. 문구만 바꾸면 다음엔 다른
    # 글자에서 또 걸리므로, **본문을 명령줄에서 없앤다.**
    #
    # `/tmp/spec-` 접두사는 러너 허용목록에 이미 있어(`cat > /tmp/spec-*`) 권한이 늘지 않는다.
    #
    # 상한은 그대로다 — 서버가 `content.length` 를 5000자로 본다(`comment/route.ts:27`).
    # 파일로 넘긴다고 길게 쓸 수 있는 것이 아니다.
    if [[ "$body" == "--file" ]]; then
      file="${4:-}"; parent="${5:-}"
      [[ -n "$file" ]] || die "사용법: api.sh comment <postId> <persona> --file <경로> [parentId]"
      [[ -r "$file" ]] || die "본문 파일을 읽을 수 없습니다: $file"
      body="$(cat "$file")"
      [[ -n "$body" ]] || die "본문 파일이 비어 있습니다: $file"
    fi
    [[ -n "$id" && -n "$persona" && -n "$body" ]] \
      || die "사용법: api.sh comment <postId> <persona> (<내용>|--file <경로>) [parentId]"
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

  done)
    id="${1:-}"
    [[ -n "$id" ]] || die "사용법: api.sh done <postId>"
    # 태그를 실어 보내지 않는다 — 서버가 ai-done 하나만 더한다(close/route.ts 주석 참고).
    # postId 형식 검사도 서버가 한다.
    call -X POST -H 'Content-Type: application/json' \
      -d "$(printf '{"postId":"%s"}' "$id")" "$BASE/api/ai-team/close"
    ;;

  *)
    die "알 수 없는 명령: '${cmd}'. threads | thread | comment | done 중 하나여야 합니다."
    ;;
esac
