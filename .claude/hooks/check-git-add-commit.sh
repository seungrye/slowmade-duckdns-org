#!/bin/bash
# git add와 git commit을 && 로 한 줄에 묶어 실행하는지 검사합니다.

cmd=$(python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('tool_input', {}).get('command', ''))
" 2>/dev/null)

if python3 -c "
import re, sys
cmd = sys.argv[1]
sys.exit(0 if re.search(r'git.+add.+&&.+git.+commit', cmd, re.DOTALL) else 1)
" "$cmd" 2>/dev/null; then
  echo '{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "git add와 git commit을 &&로 묶어 실행하지 마세요. 두 명령을 분리해서 실행하세요."}}'
  exit 1
fi
