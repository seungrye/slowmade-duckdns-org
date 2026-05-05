#!/bin/bash
# git push 전 전체 테스트 스위트를 실행합니다.

REPO=$(git rev-parse --show-toplevel 2>/dev/null)

deny() {
  echo "{\"hookSpecificOutput\": {\"hookEventName\": \"PreToolUse\", \"permissionDecision\": \"deny\", \"permissionDecisionReason\": \"$1\"}}"
  exit 1
}

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" --no-use
nvm use lts/iron --silent 2>/dev/null || true

cd "$REPO/webapp" || deny "webapp 디렉터리를 찾을 수 없습니다."

pnpm test >&2
[ $? -ne 0 ] && deny "전체 테스트가 실패했습니다. 모든 테스트를 통과한 후 push하세요."
