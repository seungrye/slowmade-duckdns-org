# 장로의 비밀 간식 — 잠입 퀘스트 카탈로그

장로(elder) 가 시장 주인(`market_owner`) 이 숨긴 *졸라맛있는 틴탐 크래커*
(`super_tintham_cracker`) 를 가져와 달라고 의뢰하는 1 회성 잠입 퀘스트의
**site 카탈로그** 정의.

## 배경

`docs/spec/quest-catalog.md` 의 4 종 카탈로그(quest/villager/item/zone) 위에
신규 1 회성 잠입 컨텐츠를 얹는다. 작업 분량을 줄이기 위해 다음과 같이
사이클을 분할한다:

| 사이클 | 범위 |
|--------|------|
| **P1** (이 스펙) | site — items / villager / quest 카탈로그 데이터 + `RevealVendorVision` 효과 키 추가 |
| P2 (후속) | game — `EnterNpcFov` / `HoldingItemAndInFov` 트리거, `TeleportToNpcHome` 액션 |
| P3 (후속) | game — 액세서리 기반 vendor FOV 시각화 |

## 디자인 요약

1. 장로가 시장 주인이 숨긴 비밀 간식을 원함
2. 일반 *틴탐 크래커* (`tintham_cracker`, HP+10) 는 시장에서 판매
3. *졸라맛있는 틴탐 크래커* (`super_tintham_cracker`, HP+10) 는 시장 주인이 숨김
4. 장로가 *시장 주인 투시 안경* (`market_vision_glasses`) 액세서리를 지급
5. 안경 = 시장 주인 시야 가시화 (`RevealVendorVision` 키)
6. 플레이어가 시야 회피 후 `super_tintham_cracker` 픽업
7. 보유 중 시야에 들어가면 퀘스트 실패 → 장로 집 텔레포트 + 아이템 회수
8. 장로에게 전달 → 보상 = `tintham_cracker` ×1
9. 등장 조건: 시작 마을(Town) 에 장로/Market landmark/`market_owner` villager 모두 존재. 1 회성.

## ✅ P1 — site 카탈로그

### 1) `RevealVendorVision` AccessoryEffect 추가

`webapp/src/types/item.ts` 의 `AccessoryEffect` union 에 `"RevealVendorVision"`
키를 추가한다. UI 라벨도 같이.

```ts
export type AccessoryEffect =
  | "RevealGuardVision"
  | "RevealTrapsInSight"
  | "RevealVendorVision";  // 추가
```

`ACCESSORY_EFFECT_LABELS["RevealVendorVision"] = "상인 시야 노출 (잠입)"`

`webapp/src/models/item.tsx` 의 주석도 동기화.

**테스트**:
- `webapp/src/lib/ron.test.ts` — `RevealVendorVision` 효과 키 RON 라운드트립 보존
- `webapp/src/lib/item-validation.test.ts` — accessory effects 에 `RevealVendorVision`
  값 허용 (기존 화이트리스트 갱신 자동 반영)

### 2) Items 카탈로그 (mongo 직접 삽입)

`handmade-site.items` 컬렉션. 모두 신규(현재 컬렉션 비어 있음).

| id | kind | displayName | 비고 |
|----|------|-------------|------|
| `tintham_cracker` | consumable | 틴탐 크래커 | HP +10. 시장 일반 판매 (가격/판매 여부는 게임 측 결정). |
| `super_tintham_cracker` | consumable | 졸라맛있는 틴탐 크래커 | HP +10. 게임 측에서 vendor 인벤토리 비노출, 시장 spawn 만 허용 (P2). |
| `market_vision_glasses` | accessory | 시장 주인 투시 안경 | `RevealVendorVision` 효과. 퀘스트 보상으로만 획득. |

`pickupMessage` / `desc` 필드는 본 스펙의 한국어 한 줄 설명으로 채운다.
스키마에는 `price` / `hidden` 필드가 없으므로, 가격·은닉 로직은 P2 의
game 측 mechanic 영역으로 분리한다(여기선 데이터만).

### 3) Villagers 카탈로그 — `market_owner`

`handmade-site.villagers` 컬렉션에 신규 doc 삽입.

| 필드 | 값 |
|------|-----|
| `id` | `market_owner` |
| `name` | `구두쇠 박씨` |
| `color` | `[0.6, 0.4, 0.2]` (갈색) |
| `dialogs` | `["어서 오세요!", "둘러보고 가세요.", "흠... 뭐 사실 건가요?"]` |
| `speed` | `0.5` |
| `vendor` | `true` |
| `stationary` | `true` |
| `homeZone` | `{ type: "Town" }` |
| `homeLandmark` | `market` |
| `freeRoam` | `false` |

기존 `elder` (id: `elder`) 는 그대로 사용.

### 4) Quest — `elder_tintham_quest`

`handmade-site.quests` 컬렉션에 신규 doc 삽입.

| 필드 | 값 |
|------|-----|
| `id` | `elder_tintham_quest` |
| `title` | 장로의 비밀 간식 |
| `giverNpc` | `elder` |
| `initialPhase` | `dormant` |
| `spawnChance` | `1.0` |

**phases**:
- `dormant` — 시작 상태, dialog "..." (장로의 의뢰 전 인사)
- `accepted` — 장로가 안경 지급 + 시장에 `super_tintham_cracker` spawn
- `in_progress` — (P2 트리거로 진입) 플레이어가 안경 보유 + 시장 안
- `completed` — 장로에게 전달 후 보상 수령
- `failed` — vendor FOV 에 노출 (P2 트리거로 진입) → 텔레포트 + 회수 → 재시도 가능 → `accepted` 로 재돌입

**transitions** (P1 에서 만들 수 있는 것만):
- `dormant -[Interact:Always]→ accepted` (장로 대화)
  - actions: `GiveItem(market_vision_glasses)`, `Log(...)`
- `accepted -[Interact: HasItem(super_tintham_cracker)]→ completed` (장로에게 전달)
  - actions: `RemoveItem(super_tintham_cracker)`, `GiveItem(tintham_cracker)`, `Log(보상)`
- `failed -[Interact:Always]→ accepted` (장로에게 재시도)
  - actions: `Log(다시 도전)`

**spawns**:
- `accepted` 페이즈에 `super_tintham_cracker` spawn at Town zone
  (P2 에서 zone 안 Market landmark 한정으로 좁힐 수 있도록 condition 보완 예정)

**제약**:
- `once_per_run` 의미는 `spawnChance: 1.0` + `initialPhase: dormant` + dormant 외 페이즈는 spawn 없음으로 구현(기존 시스템에서 "1 회성" 의미는 phase 진행으로 자연히 보장).

### 5) RON export 검증

`/api/game/content/v1` 응답에:
- `items["consumables.ron"]` 에 `tintham_cracker`, `super_tintham_cracker` 포함
- `items["accessories.ron"]` 에 `market_vision_glasses` (effects: `[RevealVendorVision]`) 포함
- `villagers` 에 `market_owner` 포함
- `quests` 배열에 `elder_tintham_quest` 포함

### 6) 회귀 테스트

- `webapp/src/lib/ron.test.ts` — `RevealVendorVision` 라운드트립
- 기존 `pnpm vitest run` 통과 유지

## P2 — game mechanic (스펙만, 후속)

### 새 TriggerKind 후보
- `EnterNpcFov(npc_id)` — 특정 NPC 의 vision 안에 들어옴
- `HoldingItemAndInFov(item_id, npc_id)` — 위 둘 동시 (퀘스트 실패 조건)

### 새 ActionKind 후보
- `TeleportToNpcHome(npc_id)` — 해당 NPC home_landmark 위치로 텔레포트
- `RemoveItem(item_id)` — 이미 site types 에 존재. 게임 측 핸들러 확인 필요.

### Trigger/Action 추가 시 동기화 필요
- bevy-rogue: `src/modules/quest/mod.rs` 의 enum + 핸들러
- site: `webapp/src/types/quest.ts` `TriggerKind` / `Action` union, `webapp/src/lib/ron.ts` 의 RON serializer/parser, `webapp/src/components/quest-editor` 의 form UI

## P3 — accessory FOV 시각화 (스펙만, 후속)

`market_vision_glasses` 인벤토리 보유 시 시장 주인의 FOV 영역을 빨갛게
하이라이트. 기존 `RevealGuardVision` 의 가드 FOV 시각화 시스템과 동형.

`vendor: true` 인 villager 에 대해 FOV 를 계산해 별도 색상으로 표시.
가드와 분리된 effect 키로 두어 UI 토글이 독립적이도록.

## 보고

- P1 (이 스펙) 완료 시 카탈로그 데이터 + 효과 키 추가로 게임은 안경을 보상으로
  주고 회수 로직까지 일부 동작. 단 vendor FOV 시각화·실패 trigger·텔레포트는
  P2/P3 가 들어와야 완성.
- 후속 sub-task 제안:
  1. P2 — 게임 측 `EnterNpcFov` / `HoldingItemAndInFov` trigger + `TeleportToNpcHome` action
  2. P3 — `RevealVendorVision` 키에 대응하는 vendor FOV overlay 렌더링
