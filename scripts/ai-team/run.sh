#!/usr/bin/env bash
# AI 개발팀 야간 러너 (#207).
#
# 매일 새벽 한 번, 요청 스레드를 읽고 덧글로 응답한다. systemd 타이머가 부른다
# (scripts/deploy/ai-team.timer).
#
# ── 자율성 수준 (A): 제안만 ─────────────────────────────────────────────
#
# 코드를 고치지 않는다. 그리고 이것은 **약속이 아니라 구조**다 — 아래에서 파일 수정
# 도구(Edit/Write)를 아예 빼고 실행하므로, 프롬프트가 잘못 읽혀도 파일을 못 고친다.
# 밖으로 나가는 쓰기 경로는 `/api/ai-team/comment` 하나뿐이고 그건 덧글만 만든다.
#
# ── 스레드 내용을 믿어도 되는 이유 ──────────────────────────────────────
#
# 요청 스레드는 주인의 **비공개** 글이고, #205 를 고친 뒤로는 주인과 AI 페르소나만
# 덧글을 달 수 있다. 즉 이 프롬프트에 실리는 내용은 외부인이 심을 수 없다.
# (#205 이전에는 로그인한 아무나 덧글을 넣을 수 있었고, 그건 곧 이 루프에 대한
#  프롬프트 인젝션 통로였다.)
set -euo pipefail

SITE_DIR="${SITE_DIR:-/home/seungrye/site}"
ENV_FILE="${ENV_FILE:-$SITE_DIR/webapp/.env.local}"
BASE_URL="${AI_TEAM_BASE_URL:-https://handmade.r-e.kr}"

log() { printf '\033[1;34m[ai-team]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[ai-team]\033[0m %s\n' "$*" >&2; exit 1; }

command -v claude >/dev/null 2>&1 || die "claude CLI 를 찾을 수 없습니다 (PATH: $PATH)"
[[ -r "$ENV_FILE" ]] || die "env 파일을 읽을 수 없습니다: $ENV_FILE"

# 파일 전체를 source 하지 않는다 — 다른 비밀까지 환경에 올릴 이유가 없다. 값 하나만 꺼낸다.
AI_TEAM_KEY="$(grep -E '^AI_TEAM_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
AI_TEAM_KEY="${AI_TEAM_KEY%$'\r'}"                                  # CRLF 로 저장된 경우
AI_TEAM_KEY="${AI_TEAM_KEY%\"}"; AI_TEAM_KEY="${AI_TEAM_KEY#\"}"    # "값" 따옴표 벗기기
AI_TEAM_KEY="${AI_TEAM_KEY%\'}"; AI_TEAM_KEY="${AI_TEAM_KEY#\'}"    # '값' 따옴표 벗기기
[[ -n "$AI_TEAM_KEY" ]] || die "AI_TEAM_KEY 가 $ENV_FILE 에 없습니다. 설정 전에는 API 가 404 로 닫혀 있습니다."
export AI_TEAM_KEY AI_TEAM_BASE_URL="$BASE_URL"

# 모델은 curl 을 직접 부르지 않는다 — 래퍼 하나만 쓴다 (#215). 이유는 api.sh 주석 참고:
# 셸 변수가 든 명령은 권한 규칙을 통과하지 못하고, 키를 명령줄에 박으면 로그에 남는다.
API="$SITE_DIR/scripts/ai-team/api.sh"
[[ -x "$API" ]] || die "래퍼를 실행할 수 없습니다: $API"

log "요청 스레드 확인 — $BASE_URL"

PROMPT=$(cat <<'PROMPT_END'
당신은 이 사이트(~/site)의 야간 담당입니다. 지금은 사람이 자고 있고, 아침에 결과를 봅니다.

## 오늘 할 일

사이트와는 **아래 세 명령으로만** 이야기합니다. 다른 방법으로 부르지 마세요 —
셸 변수(달러 기호)가 들어간 명령은 권한 규칙에 막혀 실행되지 않습니다. 값은 **그대로**
적으세요. 인증은 래퍼가 알아서 합니다.

1. 열린 요청 목록:
   @API@ threads

2. 스레드 하나 읽기 (본문 + 지금까지의 덧글):
   @API@ thread <postId>

3. 덧글 달기 — 내용을 작은따옴표로 감싸면 여러 줄도 그대로 들어갑니다:
   @API@ comment <postId> claude '내용을 여기에'

   답글로 달려면 마지막에 parentId 를 하나 더 붙입니다:
   @API@ comment <postId> claude '내용' <parentId>

## 응답 규칙

- **한 스레드에 하루 최대 한 덧글.** 오늘 이미 단 스레드는 건너뜁니다.
- 마지막 덧글이 **사람**(isBot=false)이면 응답합니다.
- 마지막 덧글이 **AI**(isBot=true)면 사람 차례이므로 보통 기다립니다.
  단, 제목에 "상시"가 들어간 스레드는 매일 새 제안을 남겨도 됩니다.
- 응답할 것이 없으면 **아무것도 하지 않고 끝냅니다.** 억지로 쓰지 마세요.

## 끝난 요청 닫기

목록에 오는 것은 **아직 안 닫힌 요청뿐**입니다 — 닫힌 글은 빠집니다.

요청이 다 처리됐다고 판단되면 직접 닫을 수 있습니다:

   @API@ done <postId>

**반드시 덧글을 먼저 달고 닫으세요.** 닫고 나면 그 스레드에는 더 이상 덧글을 달 수 없습니다
(서버가 막습니다). 즉 **닫는 이유를 적을 기회는 닫기 전뿐**입니다. 무엇이 끝났고 무엇이
남았는지 덧글로 정리한 다음 닫으세요.

**확신이 없으면 닫지 말고 물어보세요.** 닫는 것보다 열어 두는 쪽이 비용이 쌉니다.
(되돌리기는 사람이 `ai-done` 태그를 떼면 되고, 글도 덧글도 그대로 남습니다.)

## 무엇을 쓰나

요청에 대한 **스펙 논의**를 씁니다. 무엇을 만들지, 어디를 고쳐야 하는지, 어떤 선택지가
있고 무엇을 권하는지, 어떻게 검증할지. 근거는 실제 코드에서 찾아 파일 경로로 인용하세요.
추측을 사실처럼 쓰지 마세요 — 확인한 것과 추정한 것을 구분해 적습니다.

## 하지 않는 것

- **코드를 고치지 않습니다.** (도구 자체가 없습니다)
- 커밋·푸시·PR·배포를 하지 않습니다.
- 덧글 외에 사이트 상태를 바꾸지 않습니다.
- 사람의 결정이 필요한 것을 대신 결정하지 않습니다 — 선택지를 정리해 두고 물어보세요.
PROMPT_END
)
# 프롬프트는 확장이 일어나지 않는 heredoc 으로 쓴다(달러 기호가 섞이면 안 되므로).
# 래퍼 경로만 자리표시자로 끼워 넣는다 — 비밀이 아니라 경로다.
PROMPT="${PROMPT//@API@/$API}"

claude -p "$PROMPT" \
    --add-dir "$SITE_DIR" \
    --disallowedTools Edit Write NotebookEdit \
    --allowedTools Read Grep Glob "Bash($API *)" "Bash(git log*)" "Bash(git diff*)" "Bash(git status*)" \
    --permission-mode dontAsk

log "완료"
