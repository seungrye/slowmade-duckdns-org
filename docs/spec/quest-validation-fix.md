# 퀘스트 시스템 Rust 호환성 수정 ✅

bevy-rogue Rust 코드와 비교하여 발견된 3가지 문제를 수정한다.

## 1. `Always` 조건 → RON 직렬화 수정

### 문제
`Condition.type = "Always"` 를 RON으로 직렬화하면 `Always` 가 출력되나,
Rust `QuestCondition` 에 `Always` variant 가 없어 게임 로드 시 파싱 에러 + `process::exit(1)`.

### 해결
`Always` 는 에디터 UX 에서 유지 (사용자가 선택 가능한 "무조건 참" 조건).
RON 직렬화 시 Rust가 인식하는 동치 표현으로 변환:

```
Always  →  And([])
```

근거: Rust `And(conds) => conds.iter().all(...)` — 빈 vec 의 `all()` 은 vacuous truth (항상 true).

변경 파일: `src/lib/ron.ts` (serializeCondition 함수)

---

## 2. 구조적 검증 추가 (`validateQuestStructure`)

### 문제
`quest-validation.ts` 의 `validateQuestRefs` 는 카탈로그 참조(villager/item/zone)만 검증.
Rust `validate_quest_def` 가 체크하는 구조적 일관성은 검증하지 않아,
잘못된 퀘스트 export 시 게임 크래시.

### 누락된 검증 항목 (Rust 기준)
| 항목 | Rust 에러 | 사이트 현재 |
|------|-----------|-------------|
| `initialPhase` 가 phases 에 존재하는지 | `exit(1)` | ❌ 없음 |
| `AdvancePhase(id)` 대상이 phases 에 존재하는지 | `exit(1)` | ❌ 없음 |
| `auto_advance[].nextPhase` 가 phases 에 존재하는지 | `exit(1)` | ❌ 없음 |
| `auto_advance[].actions` 에 허용되지 않는 액션 타입 | `exit(1)` | ❌ 없음 |
| `spawns[].phase` 가 phases 에 존재하는지 | `exit(1)` | ❌ 없음 |

### 해결
`quest-validation.ts` 에 `validateQuestStructure(quest: QuestDef): QuestStructError[]` 추가.

```typescript
export interface QuestStructError {
  path: string;
  message: string;
}
```

`auto_advance.actions` 허용 타입: `DespawnWorldItem`, `RemoveItem`, `SetFlag` 만 허용.
(Rust `is_auto_advance_action_supported` 과 동일)

`AdvancePhase` 는 `on_interact` 내부 재귀 (Branch ifTrue/ifFalse 포함) 검증.

### 적용 위치
- **PUT /api/quests/[id]** : `validateQuestStructure` 결과를 `structErrors` 로 응답에 포함 (soft — 저장 차단 X)
- **GET /api/quests/[id]/export** : `structErrors` 있으면 `400` 반환 (hard — 깨진 RON 방지)
- **POST /api/quests/[id]/import** : `structErrors` 있으면 `400` 반환 (hard)

---

## 3. `alchemist_quest` 스펙 문서 추가

`docs/spec/quest.md` (bevy-rogue) 에는 `alchemist_quest` 가 있으나
사이트 퀘스트 스펙 문서에 누락.

`docs/spec/quest-catalog.md` 또는 별도 파일에 alchemist_quest 섹션 추가.
(기능 버그 아님 — 문서 gap)

---

## 테스트

- `ron.test.ts`: `Always` 조건 → `And([])` 직렬화 검증
- `quest-validation.test.ts`: 각 구조 에러 케이스 검증 (5종)
- export route test: `structErrors` 있을 때 400 반환 검증

## 테스트 픽스처 수정

`export/route.test.ts` 의 `baseQuest.phases` 가 빈 객체였으나,
`validateQuestStructure` 가 추가된 후 `initialPhase: 'phase_start'` 가
phases 에 없어 400 을 반환. 픽스처에 `phase_start` 페이즈 추가.
