# 퀘스트 카탈로그 시스템

bevy-rogue 의 villager / quest_item / Named zone 을 webapp 에서 1급
카탈로그로 관리한다. 퀘스트 RON 의 stringly-typed 참조 (`giverNpc`,
`itemId`, `OpenPortal.zone`) 를 카탈로그 ID 기반으로 자동완성·검증한다.

## 배경

`giverNpc` / `GiveItem.itemId` / `OpenPortal.zone` 등은 free-form
문자열이라 오타 검증이 안 된다. Rust 런타임은 startup 에서
`validate_quest_villager_refs` / `validate_quest_item_refs` 로 끊어진
참조를 발견하면 process exit 하지만, webapp 에선 잘못된 RON 을 export
할 수 있다.

bevy-rogue 의 데이터 분리 구조와 일치시킨다:
- `assets/villagers/villagers.ron` — `Vec<VillagerDef>`
- `assets/items/{quest_items,weapons,armors,consumables}.ron`
- Named zones — 각 quest 의 `OpenPortal` 액션에 분산 등록 (별도 RON 없음)

## 사이클 분할

| 단계 | 범위 |
|------|------|
| C1 | Villagers 카탈로그 (a: 스키마+API, b: UI+시드, c: picker 통합) |
| C2 | Items 카탈로그 (4종 통합: quest/weapon/armor/consumable) |
| C3 | Named zones 카탈로그 |
| C4 | 저장 시 참조 무결성 검증 |

---

## ✅ C1a — Villagers 스키마 + CRUD API

### MongoDB 컬렉션

`villagers` 컬렉션. 스키마는 Rust `VillagerDef` 와 일치:

| 필드 | 타입 | 제약 / 기본 |
|------|------|------|
| `name` | `String` | required, **unique** (PK 역할) |
| `color` | `[Number, Number, Number]` | required, RGB 0.0~1.0 |
| `dialogs` | `[String]` | default `[]` |
| `questId` | `String \| null` | default `null` |
| `speed` | `Number` | default `1.0` |

`name` 을 PK 로 쓰는 이유: bevy-rogue 의 `giver_npc` 가 이름 기준으로
참조하므로 이름 변경은 모든 quest RON 영향. unique 제약으로 일관성 유지.

### API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/villagers` | 목록 |
| POST | `/api/villagers` | 생성 — name 중복 시 409 |
| GET | `/api/villagers/[name]` | 단일 조회 |
| PUT | `/api/villagers/[name]` | 수정 (name 자체는 변경 불가) |
| DELETE | `/api/villagers/[name]` | 삭제 |

응답 포맷은 기존 `apiSuccess`/`apiError` 컨벤션 준수.

### 검증

- `POST` 시 `name` (string), `color` ([3 numbers, 0~1]) 필수
- `dialogs` 미제공 시 `[]`, `questId` 미제공 시 `null`, `speed` 미제공 시 `1.0`
- `PUT` 시 body 의 `name` 필드는 무시 (URL 의 name 이 PK)

### 변경 범위

- [x] `webapp/src/models/villager.tsx` — Mongoose 스키마
- [x] `webapp/src/app/api/villagers/route.tsx` — GET, POST
- [x] `webapp/src/app/api/villagers/[name]/route.tsx` — GET, PUT, DELETE
- [x] 위 API 의 단위 테스트 (`*.test.ts`)
- [x] `webapp/src/types/villager.ts` — TypeScript 타입

### 비목표 (다음 사이클)

- 페이지 UI / 시드 import — C1b
- 퀘스트 에디터 picker 통합 — C1c
- 다른 카탈로그 — C2/C3
- 참조 무결성 검증 — C4

---

## ✅ C1b — Villagers 페이지 + RON import/export

### `/villagers` 페이지

- 목록 표 — name, color 미리보기 (작은 색상 칩), questId, dialogs 개수, speed
- 행별 인라인 편집/삭제 버튼
- 상단 액션: `+ 새 villager` / `.ron 가져오기` / `내보내기`
- 인라인 편집 패널: name (read-only — PK), color (3개 number input 0~1),
  questId (text), speed (number), dialogs (textarea, 줄바꿈 구분)
- 새 villager 폼: name, color (3 inputs), questId(optional), speed(default 1.0)

### RON 형식

bevy-rogue `assets/villagers/villagers.ron` 형식과 일치 — `Vec<VillagerDef>`:

```ron
[
    VillagerDef(
        name: "장로",
        color: (0.9, 0.8, 0.5),
        dialogs: [],
        quest_id: Some("gem_quest"),
        speed: 0.5,
    ),
    ...
]
```

`color` 는 tuple `(r, g, b)` (0.0~1.0). `quest_id` 는 `Option<String>`
(`Some("...")` / `None`).

### Import API

`POST /api/villagers/import` — body 는 RON 텍스트.

동작 — **upsert by name**:
- 기존 name → 필드 갱신
- 신규 name → 생성
- import 에 없는 기존 villager → 보존 (사용자 커스텀 보호)

응답: `{ created: number, updated: number }`.

오류:
- RON 파싱 실패 → 400
- color 검증 실패 (∉ 0~1) → 400 + 오류 villager name 명시

### Export API

`GET /api/villagers/export` — `Vec<VillagerDef>` RON 텍스트 반환,
`Content-Disposition: attachment; filename="villagers.ron"`.

### Seed 스냅샷

`webapp/villagers/villagers.ron` — bevy-rogue 의 `assets/villagers/villagers.ron`
사본. 사용자가 import 시 업로드할 수 있게 동봉. 자동 시드는 안 함 — 사용자
명시적 클릭으로만.

### 변경 범위

- [x] `webapp/src/lib/ron.ts` — `parseVillagersRon`, `serializeVillagersRon`
  추가 (Parser 클래스에 `parseVillagerDef`, color tuple 헬퍼)
- [x] `webapp/src/lib/ron.test.ts` — villagers 라운드트립 단위 테스트
- [x] `webapp/src/app/api/villagers/import/route.tsx` + 테스트
- [x] `webapp/src/app/api/villagers/export/route.tsx` + 테스트
- [x] `webapp/src/app/villagers/page.tsx` + 테스트
- [x] `webapp/villagers/villagers.ron` — bevy-rogue 시드 스냅샷

### 비목표

- 퀘스트 에디터의 giverNpc/KillNpc picker — C1c
- color picker (RGB 휠) — 일반 number input 으로 충분

---

## ✅ C1b' — `/quests/` 하위로 라우트 이동

퀘스트 관련 라우트 일관성을 위해 villagers 페이지·API 를 모두 `/quests/`
하위로 옮긴다.

### 경로 변경

| 이전 | 이후 |
|------|------|
| `/villagers` | `/quests/villagers` |
| `/api/villagers` | `/api/quests/villagers` |
| `/api/villagers/[name]` | `/api/quests/villagers/[name]` |
| `/api/villagers/import` | `/api/quests/villagers/import` |
| `/api/villagers/export` | `/api/quests/villagers/export` |

### 변경 범위

- [x] `webapp/src/app/villagers/` → `webapp/src/app/quests/villagers/`
- [x] `webapp/src/app/api/villagers/` → `webapp/src/app/api/quests/villagers/`
- [x] 페이지의 `fetch("/api/villagers...")` 호출들 → `/api/quests/villagers...`
- [x] (선택) 시드 파일 `webapp/villagers/villagers.ron` 위치는 라우트와
  무관하므로 본 사이클에서는 이동하지 않음. 별도로 논의.

---

## ✅ C1d — 단일 source-of-truth (DB) 정착 + Villager revisions

`webapp/quests/`, `webapp/villagers/` 는 production 데이터 저장소가 아니라
`lib/ron.test.ts` 의 "실제 .ron 라운드트립" 테스트 fixture 였다. production
데이터는 quests 컬렉션 + `QuestRevision` 으로 이미 DB 가 단일 source-of-truth.

이 사이클에서:
1. fixture 디렉토리 2개를 제거하고 해당 round-trip 테스트도 정리한다.
   기존 synthetic 테스트들이 모든 신규 변형을 이미 커버하고 있어 손실 없음.
2. quest 와 대칭으로 villager 도 revision 히스토리를 갖는다.

### fixture 디렉토리 정리

- [x] `webapp/quests/` 디렉토리 삭제
- [x] `webapp/villagers/` 디렉토리 삭제
- [x] `lib/ron.test.ts` 의 `describe("실제 .ron 파일 파싱·라운드트립", ...)` 제거
- [x] `lib/ron.test.ts` 의 `describe("실제 villagers.ron 파싱·라운드트립", ...)` 제거

### Villager 스키마 변경

`Villager` 모델에 `version: Number` 필드 추가 (default 1). 첫 생성 시 1.

### `VillagerRevision` 모델

`webapp/src/models/villager-revision.tsx` 새로 작성. Quest 패턴 동일:

```ts
{
  villagerId: ObjectId(ref: Villager),
  version: Number,
  villager: Object,    // 시점의 전체 VillagerDef snapshot
  createdAt: Date,
}
```

### Revision 생성 시점

- `PUT /api/quests/villagers/[name]` — 갱신 직전 현재 버전을 `VillagerRevision`
  으로 백업, 새 버전 += 1.
- `POST /api/quests/villagers/import` — 각 기존 villager 가 갱신될 때 동일.
  신규 생성은 백업 불필요 (이전 버전 없음).

### 신규 API

- [x] `GET /api/quests/villagers/[name]/revisions` — 버전 목록 (version 내림차순)
- [x] `POST /api/quests/villagers/[name]/revisions/[ver]/restore` — 롤백.
  현재 상태를 새 revision 으로 백업 후 해당 버전 데이터로 덮어씀.

### 신규 페이지

- [x] `/quests/villagers/[name]/revisions` — 버전 목록 + 롤백 버튼.
  `/quests/[id]/revisions` 와 동일 패턴.

### 기존 페이지 변경

- [x] `/quests/villagers` 의 villager 행에 `히스토리` 링크 추가
  (`/quests/villagers/[name]/revisions` 로 이동)

### 변경 범위 요약

- `webapp/src/models/villager.tsx` — `version` 필드 추가
- `webapp/src/models/villager-revision.tsx` — 신규
- `webapp/src/types/villager.ts` — `version`, `VillagerRevisionDocument` 추가
- `webapp/src/app/api/quests/villagers/[name]/route.tsx` — PUT 시 revision 생성
- `webapp/src/app/api/quests/villagers/import/route.tsx` — upsert 시 갱신 분기에 revision 생성
- `webapp/src/app/api/quests/villagers/[name]/revisions/route.tsx` — 신규
- `webapp/src/app/api/quests/villagers/[name]/revisions/[ver]/restore/route.tsx` — 신규
- `webapp/src/app/quests/villagers/[name]/revisions/page.tsx` — 신규
- `webapp/src/app/quests/villagers/page.tsx` — `히스토리` 링크 추가
- `webapp/src/lib/ron.test.ts` — 실제-파일 라운드트립 블록 2개 제거

---

## ✅ C1c — Villager picker 통합 (giverNpc / KillNpc)

quest editor 의 두 자리에서 villager `name` 을 free-form 으로 입력하던
부분을 카탈로그 기반 combobox 로 교체한다.

### 대상

- [x] `phase-panel.tsx` 의 **Giver NPC** 입력 (시작 페이즈에서만 노출)
- [x] `action-editor.tsx` 의 **KillNpc.npcId** 입력

### 컴포넌트: `<NpcCombobox>`

`webapp/src/app/quests/[id]/npc-combobox.tsx` 신규.

- HTML `<datalist>` 기반 native combobox
  - 자유 입력 + 등록된 villager `name` 자동완성
  - 카탈로그에 없는 이름도 그대로 입력 가능 (free-form fallback)
- 입력값이 카탈로그에 없을 경우 작은 경고 마커 (예: `?` 노란색) 표시 —
  오타 발견 보조. 저장은 차단하지 않음.
- 입력값이 villager 이고 `questId` 가 다른 quest 에 연결돼 있으면 작은
  힌트 (`(quest: gem_quest)`) 노출.

### 데이터 로딩

quest editor 의 최상위 페이지(`/quests/[id]/page.tsx`)에서 villager 목록을
한 번 fetch (`GET /api/quests/villagers`) 후 panel/editor 에 prop drilling.

상태: `villagers: VillagerDocument[]`. 페이지 마운트 시 1회 로드, refresh 없음
(편집 중 카탈로그 변경 가능성 낮음). 필요 시 사용자가 새로고침으로 갱신.

### 변경 범위

- [x] `webapp/src/app/quests/[id]/npc-combobox.tsx` — 신규
- [x] `webapp/src/app/quests/[id]/page.tsx` — villagers fetch + prop drill
- [x] `webapp/src/app/quests/[id]/phase-panel.tsx` — `villagers` prop 추가,
  Giver NPC 입력을 NpcCombobox 로 교체
- [x] `webapp/src/app/quests/[id]/action-editor.tsx` — `villagers` prop 추가,
  KillNpc 입력을 NpcCombobox 로 교체
- [x] `npc-combobox.test.tsx`, phase/action editor 테스트 갱신

### 비목표

- villagers 카탈로그 변경 실시간 푸시 — 페이지 새로고침으로 충분
- itemId picker — C2
- zone picker — C3

---

## C2 — Items 카탈로그 (4종 통합)

bevy-rogue 의 `assets/items/{quest_items,weapons,armors,consumables}.ron`
4 종을 webapp 1급 카탈로그로 관리한다. quest editor 의 `GiveItem` /
`GiveItems` / `RemoveItem` / `DespawnWorldItem` / `QuestSpawn.item` 가
모두 이 카탈로그를 참조한다.

### 통합 전략

**단일 `items` 컬렉션 + `kind` 변별자.** 4 종을 따로 컬렉션을 두지 않고
하나로 통합하는 이유:

- picker 의 주요 사용처(GiveItem 등) 는 종 무관하게 모든 아이템 하나의
  드롭다운에서 선택 — 단일 컬렉션이 자연스러움.
- ID 는 **globally unique** — 종 사이 충돌 방지 (Rust 런타임도 사실상
  같은 가정).
- export 시 종별 RON 4 개 파일로 분리 (group-by-kind).

### 사이클 분할

| 단계 | 범위 |
|------|------|
| C2a | 스키마 + CRUD API + revision (이번 사이클) |
| C2b | 페이지 + RON import/export (4 종) |
| C2c | quest editor 의 item picker 통합 |

revision 은 C1 처럼 별도 사이클로 빼지 않고 C2a 에 포함 — 패턴이 정립
되어 있어 추가 비용이 작다.

---

## C2a — Items 스키마 + CRUD API + revisions

### 공통 필드 — 4 종 모두

| 필드 | 타입 | 비고 |
|------|------|------|
| `id` | String | unique (globally) |
| `kind` | "quest" \| "weapon" \| "armor" \| "consumable" | required |
| `displayName` | String | required |
| `glyphAscii` | String | required |
| `glyphUnicode` | String | required |
| `glyphGameIcon` | String | required |
| `pickupMessage` | String | required |
| `version` | Number | default 1 |

### 종별 추가 필드

| kind | 필드 | 비고 |
|------|------|------|
| `quest` | `imagePath: String` | required (default `"scene/open-chest.png"`) |
| `weapon` | `attackPower: Number` | required |
| `weapon` | `element: String \| null` | optional, "fire"/"ice"/"lightning" |
| `armor` | `defenseBonus: Number` | required |
| `consumable` | `effect: { type: "Heal", amount: Number }` | required |

`consumable.effect` 는 RON 의 enum (`Heal(i32)` 등) 1:1 매핑. 현재 Rust
는 `Heal` 한 변형만 존재하지만 enum 형태 유지로 추후 확장 대비.

### 검증 (API 레벨)

- `id`, `kind`, `displayName`, `glyph*`, `pickupMessage` 모두 비어있지 않음
- `kind` 별 필수 필드 존재 여부
- `weapon.element` 값이 `null` 이거나 `"fire"|"ice"|"lightning"` 중 하나
- `consumable.effect.type` 이 `"Heal"`
- POST 시 ID 전역 중복 검사

### API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/quests/items` | 목록 (`?kind=weapon` 으로 필터 가능) |
| POST | `/api/quests/items` | 생성 (id 중복 시 409) |
| GET | `/api/quests/items/[id]` | 단일 조회 |
| PUT | `/api/quests/items/[id]` | 수정 (id, kind 자체는 변경 불가) |
| DELETE | `/api/quests/items/[id]` | 삭제 + revision 일괄 정리 |
| GET | `/api/quests/items/[id]/revisions` | 버전 목록 |
| POST | `/api/quests/items/[id]/revisions/[ver]/restore` | 롤백 |

### Revisions

`ItemRevision` 모델 — `villager-revision.tsx` 와 동일 패턴:
`{ itemId: ObjectId, version: Number, item: Object, createdAt }`.

PUT 직전·import 의 갱신 분기·restore 직전 자동 백업.

### 변경 범위

- [ ] `webapp/src/types/item.ts` — `ItemKind`, `ItemDef`(union), `ItemDocument`,
  `ItemRevisionDocument`
- [ ] `webapp/src/models/item.tsx` — Mongoose 스키마 (모든 옵셔널 필드 정의,
  종별 검증은 API 레벨)
- [ ] `webapp/src/models/item-revision.tsx` — 신규
- [ ] `webapp/src/app/api/quests/items/route.tsx` — GET/POST + 단위 테스트
- [ ] `webapp/src/app/api/quests/items/[id]/route.tsx` — GET/PUT/DELETE +
  revision 백업 + 단위 테스트
- [ ] `webapp/src/app/api/quests/items/[id]/revisions/route.tsx` — 신규 +
  단위 테스트
- [ ] `webapp/src/app/api/quests/items/[id]/revisions/[ver]/restore/route.tsx`
  — 신규 + 단위 테스트

### 비목표 (C2b/C2c)

- 페이지 UI / RON import/export — C2b
- quest editor picker 통합 — C2c
