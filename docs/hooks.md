# Claude Code 훅 시스템

Claude Code가 파일을 편집하거나 git 커밋을 실행하기 전에 자동으로 실행되는 가드 스크립트 모음입니다.
`.claude/settings.json`에 등록되어 있으며, 실제 로직은 `.claude/hooks/`에 분리되어 있습니다.

---

## 전체 흐름

```mermaid
flowchart TD
    A([작업 시작]) --> B[docs/plan/ 에 계획 작성]
    B --> C{plan 커밋}
    C -->|차단| C1["❌ impl 직후엔 report 먼저\n(impl → report 미완료)"]
    C -->|허용| D[src/ 파일 편집]

    D --> E{src/ 편집 시도}
    E -->|차단| E1[❌ plan 커밋이 없으면 편집 불가]
    E -->|허용| F[구현 + 테스트 작성]

    F --> G{impl 커밋}
    G -->|차단: plan 아님| G1[❌ plan 커밋 다음에만 가능]
    G -->|차단: 테스트 없음| G2[❌ 테스트 파일 동반 필수]
    G -->|허용| H["docs/plan/ 에 ✅ 완료 표시"]

    H --> I{report 커밋}
    I -->|차단| I1[❌ impl 커밋 다음에만 가능]
    I -->|허용| J([한 사이클 완료])

    J --> B
```

---

## 커밋 타입 판별 기준

훅은 커밋 메시지 prefix가 아니라 **스테이징된 파일 위치**로 타입을 판별합니다.

| 타입 | 조건 |
|------|------|
| `neutral` | `src/` 도 `docs/plan/` 도 없음 |
| `plan` | `docs/plan/` 만 있고, 추가된 줄에 `✅` 없음 |
| `impl` | `src/` 만 있음 |
| `report` | `docs/plan/` 만 있고, 추가된 줄에 `✅` 있음 |
| `mixed` | `src/` + `docs/plan/` 혼재 → 항상 차단 |

`neutral` 커밋(`chore:`, `fix:` 등 설정·문서 변경)은 순서 검증 없이 항상 허용됩니다.

---

## 상태 판단 방식

직전 커밋 1개가 아닌, **최근 100개 커밋 중 마지막 워크플로우 커밋**을 기준으로 현재 상태를 판단합니다.
중립 커밋이 중간에 끼어도 흐름이 끊기지 않습니다.

```
plan → chore(중립) → impl   ← 허용 (LAST = plan)
plan → chore(중립) → plan   ← 허용 (LAST = plan이 아님, plan은 impl 직후가 아니면 OK)
```

---

## 허용 / 차단 규칙 요약

```mermaid
flowchart LR
    subgraph 허용
        R1(neutral 커밋 → 항상 허용)
        R2(plan 커밋 → impl 직후가 아니면 허용)
        R3(impl 커밋 → LAST=plan 이고 테스트 파일 있으면 허용)
        R4(report 커밋 → LAST=impl 이면 허용)
    end

    subgraph 차단
        D1(plan → impl 직후 차단)
        D2(impl → LAST≠plan 차단)
        D3(impl → 테스트 없으면 차단)
        D4(report → LAST≠impl 차단)
        D5(mixed → 항상 차단)
        D6(src/ 편집 → LAST≠plan 차단)
    end
```

---

## 스크립트 목록

| 파일 | 이벤트 | 역할 |
|------|--------|------|
| `check-git-add-commit.sh` | `Bash(*git*commit*)` | `git add && git commit` 한 줄 실행 차단 |
| `check-commit-sequence.sh` | `Bash(*git*commit*)` | plan → impl → report 순서 강제 |
| `check-src-edit.sh` | `Edit`, `Write` | `src/` 편집은 plan 커밋 이후에만 허용 |

---

## 탈출 수단

상태가 꼬인 경우 빈 plan 커밋으로 사이클을 리셋할 수 있습니다.

```bash
git commit --allow-empty -m "plan: 상태 리셋"
```

---

## 알려진 한계

- Claude Code 밖에서 직접 `git commit`을 실행하면 훅이 작동하지 않습니다.
- `git rebase`, `git cherry-pick` 중에는 훅이 예상과 다르게 동작할 수 있습니다. 리베이스 완료 후에는 git log 기반으로 자가복구됩니다.
- 100개 이내에 워크플로우 커밋이 없으면 LAST=none으로 판단해 허용적으로 동작합니다.
