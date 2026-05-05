#!/bin/bash
# spec → impl → report 커밋 순서를 강제합니다.
#
# 커밋 타입은 스테이징된 파일 위치로 판별합니다:
#   neutral : webapp/ 도 android/ 도 docs/spec/ 도 없음
#   spec    : docs/spec/ 만 있고, 추가된 줄에 ✅ 없음
#   impl    : webapp/ 또는 android/ 만 있음
#   report  : docs/spec/ 만 있고, 추가된 줄에 ✅ 있음
#   mixed   : (webapp/ 또는 android/) + docs/spec/ 혼재 → 항상 차단

REPO=$(git rev-parse --show-toplevel 2>/dev/null)

# 마지막 워크플로우 커밋 타입 결정 (중립 커밋은 건너뜀)
LAST=$(git -C "$REPO" log --format="%s" --max-count=100 2>/dev/null \
  | grep -iE '^(spec|impl|report) ?:' \
  | head -1 \
  | grep -ioE '^(spec|impl|report)' \
  | tr '[:upper:]' '[:lower:]')
[ -z "$LAST" ] && LAST=none

# 스테이징된 파일 분류
staged=$(git -C "$REPO" diff --cached --name-only 2>/dev/null)

staged_src=$(echo "$staged" | grep -E '^(webapp|android)/')

# 테스트 파일 판별:
#   webapp  — *.test.ts / *.test.tsx 등 (.test. 포함)
#   android — src/test/ 또는 src/androidTest/ 디렉터리
staged_src_non_test=$(echo "$staged" | grep -E '^(webapp|android)/' \
  | grep -vE '(\.test\.|/src/(android)?[Tt]est/)')
staged_src_test=$(echo "$staged" | grep -E '^(webapp|android)/' \
  | grep -E  '(\.test\.|/src/(android)?[Tt]est/)')

staged_spec=$(echo "$staged"  | grep '^docs/spec/')
staged_check=$(git -C "$REPO" diff --cached -- docs/spec/ 2>/dev/null | grep '^+.*✅')

# 워크플로우 외 파일 (webapp/, android/, docs/spec/ 이외)
staged_other=$(echo "$staged" | grep -vE '^(webapp|android|docs/spec)/')

# 현재 커밋 타입 판별
if [ -z "$staged_src" ] && [ -z "$staged_spec" ]; then
  CURRENT=neutral
elif [ -z "$staged_src" ] && [ -n "$staged_other" ]; then
  # 비워크플로우 파일이 포함된 경우 neutral (예: .claude/, docs/hooks.md 변경)
  CURRENT=neutral
elif [ -n "$staged_spec" ] && [ -z "$staged_src" ] && [ -z "$staged_check" ]; then
  CURRENT=spec
elif [ -n "$staged_src"  ] && [ -z "$staged_spec" ]; then
  CURRENT=impl
elif [ -n "$staged_spec" ] && [ -z "$staged_src" ]  && [ -n "$staged_check" ]; then
  CURRENT=report
else
  CURRENT=mixed
fi

# 차단 헬퍼
deny() {
  echo "{\"hookSpecificOutput\": {\"hookEventName\": \"PreToolUse\", \"permissionDecision\": \"deny\", \"permissionDecisionReason\": \"$1\"}}"
  exit 1
}

case "$CURRENT" in
  neutral)
    # 중립 커밋은 항상 허용
    ;;
  spec)
    # impl 직후에는 report 먼저
    [ "$LAST" = "impl" ] && deny "impl 커밋 후에는 report 커밋이 먼저 필요합니다. docs/spec/ 에 ✅ 완료 보고를 커밋하세요."
    ;;
  impl)
    # spec 직후에만 허용
    [ "$LAST" != "spec" ] && deny "impl 커밋은 spec 커밋 다음에만 가능합니다. docs/spec/ 에 스펙을 먼저 커밋하세요."
    # 테스트 파일 동반 필수
    [ -n "$staged_src_non_test" ] && [ -z "$staged_src_test" ] && deny "impl 커밋 시 테스트 파일도 함께 커밋해야 합니다."
    # 변경된 테스트 파일 실행하여 통과 확인
    if [ -n "$staged_src_test" ]; then
      TEST_FILES=$(echo "$staged_src_test" | grep '^webapp/' | sed 's|^webapp/||' | tr '\n' ' ')
      if [ -n "$TEST_FILES" ]; then
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" --no-use
        nvm use lts/iron --silent 2>/dev/null || true
        cd "$REPO/webapp" || deny "webapp 디렉터리를 찾을 수 없습니다."
        # shellcheck disable=SC2086
        pnpm exec vitest run $TEST_FILES >&2
        [ $? -ne 0 ] && deny "테스트가 실패했습니다. 테스트를 통과한 후 커밋하세요."
      fi
    fi
    ;;
  report)
    # impl 직후에만 허용
    [ "$LAST" != "impl" ] && deny "report 커밋은 impl 커밋 다음에만 가능합니다."
    ;;
  mixed)
    deny "webapp/ 또는 android/ 와 docs/spec/ 을 함께 커밋할 수 없습니다. spec/impl/report 타입을 분리하세요."
    ;;
esac
