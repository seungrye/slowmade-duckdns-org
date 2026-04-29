#!/bin/bash
# plan → impl → report 커밋 순서를 강제합니다.
#
# 커밋 타입은 스테이징된 파일 위치로 판별합니다:
#   neutral : src/ 도 docs/plan/ 도 없음
#   plan    : docs/plan/ 만 있고, 추가된 줄에 ✅ 없음
#   impl    : src/ 만 있음
#   report  : docs/plan/ 만 있고, 추가된 줄에 ✅ 있음
#   mixed   : src/ + docs/plan/ 혼재 → 항상 차단

REPO=$(git rev-parse --show-toplevel 2>/dev/null)

# 마지막 워크플로우 커밋 타입 결정 (중립 커밋은 건너뜀)
LAST=$(git -C "$REPO" log --format="%s" --max-count=100 2>/dev/null \
  | grep -iE '^(plan|impl|report) ?:' \
  | head -1 \
  | grep -ioE '^(plan|impl|report)' \
  | tr '[:upper:]' '[:lower:]')
[ -z "$LAST" ] && LAST=none

# 스테이징된 파일 분류
staged=$(git -C "$REPO" diff --cached --name-only 2>/dev/null)
staged_src=$(echo "$staged"          | grep '^src/')
staged_src_non_test=$(echo "$staged" | grep '^src/' | grep -v '\.test\.')
staged_src_test=$(echo "$staged"     | grep '^src/' | grep '\.test\.')
staged_plan=$(echo "$staged"         | grep '^docs/plan/')
staged_check=$(git -C "$REPO" diff --cached -- docs/plan/ 2>/dev/null | grep '^+.*✅')

# 현재 커밋 타입 판별
if   [ -z "$staged_src" ] && [ -z "$staged_plan" ]; then
  CURRENT=neutral
elif [ -n "$staged_plan" ] && [ -z "$staged_src" ] && [ -z "$staged_check" ]; then
  CURRENT=plan
elif [ -n "$staged_src"  ] && [ -z "$staged_plan" ]; then
  CURRENT=impl
elif [ -n "$staged_plan" ] && [ -z "$staged_src" ]  && [ -n "$staged_check" ]; then
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
  plan)
    # impl 직후에는 report 먼저
    [ "$LAST" = "impl" ] && deny "impl 커밋 후에는 report 커밋이 먼저 필요합니다. docs/plan/ 에 ✅ 완료 보고를 커밋하세요."
    ;;
  impl)
    # plan 직후에만 허용
    [ "$LAST" != "plan" ] && deny "impl 커밋은 plan 커밋 다음에만 가능합니다. docs/plan/ 에 계획을 먼저 커밋하세요."
    # 테스트 파일 동반 필수
    [ -n "$staged_src_non_test" ] && [ -z "$staged_src_test" ] && deny "impl 커밋 시 테스트 파일도 함께 커밋해야 합니다."
    ;;
  report)
    # impl 직후에만 허용
    [ "$LAST" != "impl" ] && deny "report 커밋은 impl 커밋 다음에만 가능합니다."
    ;;
  mixed)
    deny "src/와 docs/plan/을 함께 커밋할 수 없습니다. plan/impl/report 타입을 분리하세요."
    ;;
esac
