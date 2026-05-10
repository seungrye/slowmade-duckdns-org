# ✅ 퀘스트 타입 정합 (B1)

bevy-rogue `specs/quest.md` 의 데이터 모델과 webapp 의 `QuestDef` / RON
파서를 일치시켜 import↔export 라운드트립이 손실 없이 동작하도록 한다.

## 배경

webapp 의 `src/types/quest.ts` 와 `src/lib/ron.ts` 는 Rust 모델의 부분
집합만 다룬다. bevy-rogue `assets/quests/*.ron` 중 `parry_quest`,
`demonsword_quest`, `herb_quest` 는 현재 webapp 파서에서 throw 한다 — 그래서
`webapp/quests/` 스냅샷에서도 의도적으로 빠져 있다. 또한 `SpawnZone` 의
`World(mapId)` 변형은 Rust `ZoneId` 에 존재하지 않아 export 시 잘못된 RON
을 출력한다.

## 누락 변형 — Rust → 추가 대상

### `QuestCondition`
- [x] `HasFlag("flag")` — 플래그 존재 여부 (값 무관)

### `QuestAction`
- [x] `GiveItems(item: "...", count: N)` — 수량 지정 지급
- [x] `ClearFlag("flag")` — 플래그 해제
- [x] `OpenPortal(zone, generator, placement)` — Named 존 포털 스폰
- [x] `ClosePortal("zone")` — Named 존 포털·등록·마커 정리

### `PortalPlacement` — `OpenPortal.placement`
- [x] `InsideRoom` (기본, 미지정 시)
- [x] `Border`
- [x] `Random`
- [x] `NearGiver(radius: usize)`

### `ZoneId` (webapp `SpawnZone`)
- [x] `Town` — 빌트인 마을 존
- [x] `Named("zone_id")` — 동적 퀘스트 존
- [x] 기존 `World(mapId)` 변형 제거 (Rust `ZoneId` 에 존재하지 않음)

### `QuestSpawn`
- [x] `count: u32` — 기본 1, 미지정 시 직렬화 생략
- [x] `condition: Option<QuestCondition>` — 추가 조건, `None` 이면 직렬화 생략

### `QuestDef`
- [x] `spawn_chance: f32` — 0.0~1.0, 미지정 시 1.0 (직렬화 생략)

## 변경 범위

- `webapp/src/types/quest.ts` — 위 타입 추가/정리
- `webapp/src/lib/ron.ts` — 파서·직렬화기에 모든 변형 처리. 미정의 키
  `default: break;` 로 무시하던 부분이 신규 키와 충돌하지 않게 유지
- `webapp/src/lib/ron.test.ts` — 신규 변형 단위 테스트 + bevy-rogue 전체
  RON 파일 라운드트립 (deep equal)
- `webapp/quests/` — bevy-rogue `assets/quests` 의 누락 파일
  (`parry_quest.ron`, `demonsword_quest.ron`, `herb_quest.ron`) 동기화

## 에디터 데이터 보존 정책

신규 변형의 직접 편집 UI 는 B2 사이클에서 추가한다. B1 에서는 파싱·직렬화
만 지원하고, 에디터에서 phase 를 수정해도 미지원 변형이 들어간 액션·조건
은 원본 객체 참조를 유지하여 export 시 동일 RON 으로 round-trip 되도록 한다.

- `condition-editor.tsx` / `action-editor.tsx` — 미지원 변형은 read-only
  요약 텍스트로 노출 + "RON 가져오기/내보내기로만 편집 가능" 안내. 편집
  시도 시 변경 차단 (객체 참조 유지)
- 기존 변형 (`HasItem`, `FlagIs`, `AdvancePhase`, `GiveItem`, `Log`,
  `SetFlag`, `KillNpc`, `RemoveItem`, `DespawnWorldItem`, `Branch`, `And`,
  `Or`, `Not`, `PhaseIs`, `InZone`) 은 기존대로 인라인 편집

## 라운드트립 검증

bevy-rogue `assets/quests/` 의 10개 파일을 모두:

1. 파싱 성공
2. 직렬화 후 재파싱 → 깊은 동등성 (deep equal)

대상: `gem_quest`, `herb_quest`, `alchemist_quest`, `parry_quest`,
`demonsword_quest`, `prologue_fog`, `stark_quest`, `targaryen_quest`,
`jon_snow_quest`, `world_fracture`.

## 비목표 (B2 / C 사이클)

- 신규 변형의 에디터 UI (condition/action editor 변형 추가, zone selector,
  placement 선택)
- 카탈로그 페이지 (villagers / quest_items / named zones)
- 저장 시 참조 무결성 검증
- 다중 파일 export

---

## ✅ B2 — 에디터 인라인 편집 UI

B1 에서 read-only 폴백으로 노출한 신규 변형을 webapp 에디터에서 직접
인라인 편집 가능하도록 한다. 이로써 import 없이 신규 액션·조건을
처음부터 작성할 수 있다.

### 대상 변형

#### `Condition`
- [x] `HasFlag(flag)` — flag 입력 1

#### `Action`
- [x] `GiveItems(item, count)` — itemId 입력 + count 숫자 입력
- [x] `ClearFlag(flag)` — flag 입력 1
- [x] `ClosePortal(zone)` — zone 입력 1
- [x] `OpenPortal(zone, generator, placement?)` —
  - zone, generator 입력
  - placement select: `(기본)` / `InsideRoom` / `Border` / `Random` / `NearGiver`
  - `NearGiver` 선택 시 radius 숫자 입력 추가
  - `(기본)` = `placement: undefined` (직렬화 시 placement 필드 생략)

### 변경 범위

- `webapp/src/app/quests/[id]/condition-editor.tsx`
  - 타입 select 에 `HasFlag` 옵션 추가
  - `HasFlag` 인라인 분기 추가
  - read-only 폴백 / `ReadOnlyCondition` / `summarizeCondition` 제거
- `webapp/src/app/quests/[id]/action-editor.tsx`
  - 타입 select 에 `GiveItems` / `ClearFlag` / `OpenPortal` / `ClosePortal` 옵션 추가
  - 4개 변형 인라인 분기 추가
  - `isReadOnlyAction` / read-only 폴백 / `summarizeAction` 제거
- `condition-editor.test.tsx` — `HasFlag` 렌더 테스트
- `action-editor.test.tsx` — 신규 4개 변형 렌더 테스트
  (`GiveItems`/`ClearFlag`/`OpenPortal`/`ClosePortal`, placement 분기 포함)

### UX 결정

- placement `undefined` ↔ 명시적 `{ type: "InsideRoom" }` 은 의미상 같지만
  RON round-trip 보존을 위해 구분한다. 입력 측에서 사용자가 "(기본)" 을
  명시적으로 선택하지 않는 한 import 시의 `undefined` 상태를 유지.
- placement select 의 default 옵션 라벨은 "(기본 — InsideRoom)" 으로 의미
  명시.
