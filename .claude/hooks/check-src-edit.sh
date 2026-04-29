#!/bin/bash
# src/ 파일 편집은 plan 커밋 이후에만 허용합니다.

REPO=$(git rev-parse --show-toplevel 2>/dev/null)

file=$(python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('tool_input', {}).get('file_path', ''))
" 2>/dev/null)

# src/ 외 파일이면 통과
echo "$file" | grep -q "^$REPO/src/" || exit 0

# 마지막 워크플로우 커밋 타입 결정 (중립 커밋은 건너뜀)
LAST=$(git -C "$REPO" log --format="%s" --max-count=100 2>/dev/null \
  | grep -iE '^(plan|impl|report) ?:' \
  | head -1 \
  | grep -ioE '^(plan|impl|report)' \
  | tr '[:upper:]' '[:lower:]')
[ -z "$LAST" ] && LAST=none

if [ "$LAST" != "plan" ]; then
  echo '{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "src/ 편집은 plan 커밋 다음에만 가능합니다. 먼저 docs/plan/ 에 계획을 작성하고 커밋하세요."}}'
  exit 1
fi
