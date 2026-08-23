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

log "요청 스레드 확인 — $BASE_URL"

PROMPT=$(cat <<'PROMPT_END'
당신은 이 사이트(~/site)의 야간 담당입니다. 지금은 사람이 자고 있고, 아침에 결과를 봅니다.

## 오늘 할 일

1. 열린 요청 스레드를 가져옵니다:
   curl -sS -H "x-ai-team-key: $AI_TEAM_KEY" "$AI_TEAM_BASE_URL/api/ai-team/threads"

2. 각 스레드를 읽습니다:
   curl -sS -H "x-ai-team-key: $AI_TEAM_KEY" "$AI_TEAM_BASE_URL/api/ai-team/thread?postId=<id>"

3. 응답이 필요한 스레드에 덧글을 답니다:
   curl -sS -X POST -H "x-ai-team-key: $AI_TEAM_KEY" -H "Content-Type: application/json" \
     -d '{"postId":"<id>","persona":"claude","content":"..."}' \
     "$AI_TEAM_BASE_URL/api/ai-team/comment"

## 응답 규칙

- **한 스레드에 하루 최대 한 덧글.** 오늘 이미 단 스레드는 건너뜁니다.
- 마지막 덧글이 **사람**(isBot=false)이면 응답합니다.
- 마지막 덧글이 **AI**(isBot=true)면 사람 차례이므로 보통 기다립니다.
  단, 제목에 "상시"가 들어간 스레드는 매일 새 제안을 남겨도 됩니다.
- 응답할 것이 없으면 **아무것도 하지 않고 끝냅니다.** 억지로 쓰지 마세요.

## 끝난 요청 닫기

목록에 오는 것은 **아직 안 닫힌 요청뿐**입니다 — `ai-done` 태그가 붙은 글은 빠집니다.

요청이 다 처리된 것으로 보이면 **덧글로 안내**하세요:

  "이 요청은 완료된 것으로 보입니다. 닫으시려면 이 글에 `ai-done` 태그를 붙여 주세요."

**직접 닫을 수는 없습니다.** 태그를 붙이는 것은 사람의 몫입니다 — 성급히 닫는 것보다
한 번 더 확인받는 편이 낫습니다.

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

claude -p "$PROMPT" \
    --add-dir "$SITE_DIR" \
    --disallowedTools Edit Write NotebookEdit \
    --allowedTools Read Grep Glob "Bash(curl *)" "Bash(git log*)" "Bash(git diff*)" "Bash(git status*)" \
    --permission-mode dontAsk

log "완료"
