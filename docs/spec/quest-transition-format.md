# 퀘스트 Transition 포맷 (bevy-rogue 동기화) ✅

bevy-rogue 게임 측에서 RON 퀘스트 포맷을 재설계했다 (`on_interact` +
`auto_advance` + `Branch` 중첩 → 평탄한 `transitions` 목록). 사이트의 퀘스트
에디터/직렬화/검증도 동일 포맷으로 맞춘다.

> **완료** — 타입/직렬화/검증/에디터/모델/API/테스트 모두 구현됨.
> 검증: `pnpm test` 559 passed, `tsc` 통과, 실제 게임 RON 10종을 site
> 파서로 round-trip + site 직렬화 출력을 bevy-rogue Rust 파서로 교차검증 통과.

## 배경 / 문제

기존 포맷은 전환 로직이 각 phase 안에 흩어져 있고 `Branch` 가 중첩되어
읽기 어렵다. 새 포맷은 phase 를 메타데이터(dialog, objective)만 담게 하고,
모든 상태 전환을 `QuestDef.transitions` 평탄 목록으로 모은다. 같은
`(from, trigger)` 그룹에서 순서대로 평가하여 첫 매칭만 실행한다.

## 데이터 모델 변경 (`src/types/quest.ts`)

- [x] `QuestPhaseDef` 에서 `on_interact`, `auto_advance` 제거 → `dialog`,
  `objective`, `position?` 만 유지
- [x] `QuestDef` 에 `transitions: QuestTransition[]` 추가
- [x] `QuestTransition` 신규: `{ from: string; trigger: TriggerKind;
  when?: Condition; actions: Action[]; to: string }`
- [x] `TriggerKind = "Interact" | "Auto"`
- [x] `Action` 유니온에서 `AdvancePhase`, `Branch` 제거
- [x] `AutoAdvance` 타입 제거

## RON 직렬화/파싱 (`src/lib/ron.ts`)

- [x] phase 직렬화는 `dialog` + `objective` 만 출력
- [x] `transitions` 직렬화: `Transition(from: "..", trigger: Interact|Auto,
  when: <cond>, actions: [..], to: "..")`. `when`/`actions` 는 비어있으면 생략
- [x] 파일 첫 줄에 `#![enable(implicit_some)]` 출력 → `when`/`objective` 를
  `Some()` 없이 bare 로 표기. 파서는 directive·bare·`Some(..)` 모두 수용
- [x] phase 파서에서 `on_interact`/`auto_advance` 파싱 제거
- [x] `transitions` 파서 추가 (`Transition(..)` 항목, `when` 은 optional)
- [x] Action 파서/직렬화에서 `AdvancePhase`, `Branch` 제거
- [x] `Always` 조건 → `And([])` 직렬화 (기존 동작 유지)

## 구조 검증 (`src/lib/quest-validation.ts`)

- [x] `validateQuestStructure`: `transitions` 순회로 변경
  - `from`/`to` 가 phases 에 존재하는지
  - `trigger: "Auto"` 의 `actions` 는 `DespawnWorldItem`/`RemoveItem`/`SetFlag`
    만 허용 (Rust `is_auto_action_supported` 동일)
- [x] `validateQuestRefs`: transition 의 `when` 조건과 `actions` 의 카탈로그
  참조(item/villager/zone) 검증
- [x] `on_interact`/`auto_advance`/`AdvancePhase`/`Branch` 검증 경로 제거

## 에디터 UI (`src/app/quests/[id]/`)

- [x] `build-graph.ts`: 엣지를 `transitions` 에서 생성 (transition 1개 = 엣지
  1개, label = trigger, data 에 transitionIndex)
- [x] `page.tsx` `onConnect`: 새 transition `{ from, trigger: "Interact",
  actions: [], to }` 추가
- [x] `edge-panel.tsx`: 선택한 transition 편집 (trigger 토글, `when` 조건,
  `actions`, 삭제)
- [x] `phase-panel.tsx`: dialog + objective 만 편집 (on_interact/auto_advance
  섹션 제거)
- [x] `phase-node.tsx`: on_interact/auto_advance 카운트 표시 제거
- [x] `action-editor.tsx`: `AdvancePhase`/`Branch` 액션 타입·관련 UI 제거
  (Branch flatten/unflatten 로직 삭제)

## 기타 유틸

- [x] `src/lib/zone-extract.ts`: `collectFromPhase` → `collectFromQuest` 가
  `transitions[].actions` 를 순회 (Branch 재귀 제거)

## 테스트

- [x] `ron.test.ts`: 신규 포맷 직렬화/파싱 round-trip, implicit_some
- [x] `quest-validation.test.ts`: transition 구조/참조 검증 케이스
- [x] `action-editor.test.tsx`, `phase-panel.test.tsx`, `phase-node.test.tsx`,
  `build-graph.test.ts`: 신규 포맷 픽스처로 갱신
- [x] API route 테스트(`route.test.ts`, `export/route.test.ts`,
  `zones/extract/route.test.ts`): 신규 포맷 픽스처로 갱신

## 검증 방법

- `pnpm vitest run` 전체 통과
- 에디터에서 퀘스트 로드 → 전환 엣지 표시·편집 → RON export 가
  bevy-rogue 가 파싱 가능한 포맷인지 (Transition(..), implicit_some) 확인

---

# 후속: 에디터 전환 조건 가시성

전환 조건/분기가 에디터에서 보이지 않는 문제. 엣지 라벨이 `auto`/`interact`
로만 떠서 "어떤 조건에 어떤 페이즈로 가는지" 알 수 없고, 페이즈를 선택해도
오른쪽 패널에 나가는 전환 목록이 없다.

## 동작 명세

### 조건 요약 유틸 (`src/lib/condition-summary.ts`)

- [ ] `conditionSummary(cond?: Condition): string` — 조건을 사람이 읽을 수
  있는 짧은 한글 문구로. `undefined`/`Always`/`And([])` → "무조건",
  `HasItem(x)` → "x 보유", `FlagIs(f,v)` → "f=v", `PhaseIs(q,p)` → "q=p",
  `HasFlag(f)` → "플래그 f", `InZone(zone)` → 존 라벨, `And`/`Or` → 재귀
  결합, `Not` → "!(...)"
- [ ] `zoneLabel(zone)` — Town/Forest/Dungeon(n)/Named(id) 한글 라벨

### 엣지 라벨 (`build-graph.ts`)

- [ ] 엣지 라벨에 트리거 + 조건 요약 표시 (예: "자동: gem 보유",
  "대화: 무조건"). 너무 길면 말줄임

### 페이즈 패널 나가는 전환 목록 (`phase-panel.tsx`)

- [ ] 페이즈 선택 시 "이 페이즈에서 나가는 전환" 목록을 **배열 순서대로**
  표시 (트리거 배지 + 조건 요약 + → 도착 phase)
- [ ] 같은 트리거끼리 위에서부터 첫 매칭이 실행됨을 안내
- [ ] 각 행 클릭 시 해당 전환 편집(EdgePanel) 으로 전환

## 영향 파일

- `src/lib/condition-summary.ts` (신규) + 테스트
- `src/app/quests/[id]/build-graph.ts`
- `src/app/quests/[id]/phase-panel.tsx`
- `src/app/quests/[id]/page.tsx` (PhasePanel 에 transitions + 편집 콜백 전달)

## 검증 방법

- `pnpm vitest run` 전체 통과
- 에디터에서 분기 있는 퀘스트(예: alchemist_quest, world_fracture) 로드 →
  페이즈 선택 시 나가는 전환·조건이 우선순위 순으로 보이는지, 엣지 라벨에
  조건이 보이는지 확인
