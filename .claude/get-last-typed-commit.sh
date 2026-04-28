#!/bin/bash
# 마지막 typed 커밋 타입 반환: plan | impl | report | none
# - plan   : docs/plan/ 만 포함, ✅ 없음
# - impl   : src/ 포함, docs/plan/ 없음
# - report : docs/plan/ 만 포함, ✅ 있음
# - none   : typed 커밋 없음 (neutral 커밋은 건너뜀)

REPO=/home/seungrye/site

for rev in $(git -C "$REPO" log --format="%H" --max-count=30 2>/dev/null); do
  files=$(git -C "$REPO" diff-tree --no-commit-id -r --name-only "$rev" 2>/dev/null)
  [ -z "$files" ] && continue

  if echo "$files" | grep -q '^src/'; then has_src=1; else has_src=0; fi
  if echo "$files" | grep -q '^docs/plan/'; then has_plan=1; else has_plan=0; fi

  # neutral 커밋 (src/도 docs/plan/도 없음) → 건너뜀
  [ "$has_src" -eq 0 ] && [ "$has_plan" -eq 0 ] && continue

  if [ "$has_plan" -eq 1 ] && [ "$has_src" -eq 0 ]; then
    if git -C "$REPO" show "$rev" -- docs/plan/ 2>/dev/null | grep -q '^+.*✅'; then
      echo "report"
    else
      echo "plan"
    fi
    exit 0
  elif [ "$has_src" -eq 1 ] && [ "$has_plan" -eq 0 ]; then
    echo "impl"
    exit 0
  fi
  # mixed 커밋 (src/ + docs/plan/ 혼재) → 건너뜀
done

echo "none"
