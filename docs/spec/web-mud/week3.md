# 3 주차 — 인벤토리 + 확률 판정 풍부화 + 15 씬

## 목표

milestone.md 의 3 주차 정의 구현:

- 15 씬 (기존 9 + 신규 6)
- 아이템 11 종 + 인벤토리 cap 8
- HP 시스템 + 패시브 스탯 보정
- USE_ITEM consumable, REROLL (행운아 어빌)
- 광장 → 시장 (빵) → 숲 (안경 분기) → 동굴 (횃불 조건) → 도깨비 (카리 판정) → 엔딩 데모

## 기존 시스템 변경

- `hasSecretSnack` flag → `super_tintham_cracker` 아이템 (인벤 기반 분기 마이그레이션)
- `market_storage_success.onEnter` 의 `setFlags: { hasSecretSnack }` → `addItems: ["super_tintham_cracker"]`
- `elder_house_arrival` 의 `give_snack` choice 의 `condition: { kind: "flag", key: "hasSecretSnack" }` → `condition: { kind: "hasItem", itemId: "super_tintham_cracker" }`
- `choiceFilter` / `reducer` 의 `evalCondition` 이 `effectiveStat` (base + passive 합) 을 사용하도록

## 신규 파일

| 경로 | 역할 |
|------|------|
| `webapp/src/content/web-adventure/items.ts` | 11 종 아이템 카탈로그 + INVENTORY_CAP 상수 |
| `webapp/src/lib/web-adventure/engine/stats.ts` | `effectiveStat(character, stat)` — base + passive 합 |
| `webapp/src/content/web-adventure/scenes/forest_inner.ts` | 숲 깊은 곳 (안경 분기 진입) |
| `webapp/src/content/web-adventure/scenes/forest_inner_with_glasses.ts` | 안경 보유 시 산신령 직행 |
| `webapp/src/content/web-adventure/scenes/cave_entry.ts` | 동굴 입구 (torch 조건) |
| `webapp/src/content/web-adventure/scenes/cave_inside.ts` | 동굴 내부 (마법서 / 도깨비 분기) |
| `webapp/src/content/web-adventure/scenes/cave_after_spellbook.ts` | 마법서 채집 후 (spellbook addItems) |
| `webapp/src/content/web-adventure/scenes/goblin_encounter.ts` | 도깨비 — 카리 판정 |
| `webapp/src/content/web-adventure/scenes/ending_goblin_friend.ts` | 신규 엔딩 — 도깨비의 친구 |
| `webapp/src/lib/web-adventure/engine/inventory.test.ts` | items / effectiveStat / USE_ITEM / cap 테스트 |

## 변경 파일

| 경로 | 변경 |
|------|------|
| `webapp/src/lib/web-adventure/engine/reducer.ts` | `USE_ITEM`, `REROLL` 액션 추가; `applyOnEnter` 에 cap 8 적용; `MAKE_CHOICE probability` 가 `effectiveStat` 사용 |
| `webapp/src/lib/web-adventure/engine/choiceFilter.ts` | `evalCondition` 이 `effectiveStat` 사용; `hasItem` 라벨에 displayName 매핑 |
| `webapp/src/lib/web-adventure/engine/sceneRegistry.ts` | 신규 6 씬 + ending_goblin_friend 등록 |
| `webapp/src/content/web-adventure/scenes/town_square_dawn.ts` | 4번째 선택지 — 동굴 |
| `webapp/src/content/web-adventure/scenes/forest_entry.ts` | `go_deeper` (forest_inner) 추가 |
| `webapp/src/content/web-adventure/scenes/market_storage_success.ts` | `setFlags` → `addItems` 마이그레이션 |
| `webapp/src/content/web-adventure/scenes/elder_house_arrival.ts` | `flag` 조건 → `hasItem` 조건 |
| `webapp/src/content/web-adventure/endings.ts` | `goblin_friend` 엔딩 메타 |
| `webapp/src/app/games/web-adventure/play/page.tsx` | HP + 인벤 1 줄 표시 + 재굴림 카운터 + USE_ITEM / REROLL 버튼 |
| `webapp/src/app/games/web-adventure/play/CharacterCreator.tsx` | 6 스탯 확정 후 maxHp 미리보기 (`100 + con*5`) + lucky 시 재굴림 카운터 미리보기 |

## TDD red→green

### RED

1. `webapp/src/lib/web-adventure/engine/inventory.test.ts` (신규)
   - items 카탈로그 11 종 + INVENTORY_CAP=8 + 종류별 스펙
   - `effectiveStat` — 패시브 보정 (`spirit_glasses` → wis +1 등)
   - `USE_ITEM` — consumable heal + maxHp clamp + 인벤 제거; non-consumable / 미보유 무효
   - `rollProbability(stat = effectiveStat(...))` 패시브 자동 반영
2. `reducer.test.ts` 에 추가
   - `hasItem super_tintham_cracker` 로 give_snack 가능
   - `market_storage_success` 진입 시 인벤에 추가
   - `REROLL` 액션 — rerollsLeft -1 + 재굴림; 0 시 무효
3. `__tests__/scenarios.test.ts` 에 추가
   - 패시브 안경 → forest_inner → forest_inner_with_glasses → spirit 엔딩
   - 동굴 진입 시 torch 없으면 차단
   - 도깨비 카리 12 성공 → goblin_friend 엔딩 + goblin_charm 인벤 추가

### GREEN

`pnpm test web-adventure` 전 항목 통과.

## 동작 데모

- 캐릭터 생성 (체력 7 — maxHp 135 미리보기 등) → 광장
- 광장 → 시장 → 잠입 성공 (틴탐 크래커 획득)
- 광장 → 동굴 → "횃불 없음" 표시 → 광장 복귀
- 광장 → 숲 → 깊은 숲 → (안경 보유 시) 신성한 길 → spirit 엔딩
- 광장 → 동굴 (torch 보유) → 마법서 + 도깨비 → 카리 판정 → goblin_friend 엔딩

## 제약

- 사이트 메뉴 노출 X (5 주차 베타 공개 후)
- 인벤 UI 는 1 줄 텍스트 + 사용 버튼 (사이드 패널은 5 주차)
- 도트 자산은 기존 2 장 재사용 (4 주차 작업)
- Blue/Green 배포로 무중단 적용
- 한국어 텍스트
- 회귀 0 (사전 PUA 3 무관)

## 산출물

- 인벤 / 시나리오 / reducer / choiceFilter / scenarios 테스트 전체 통과
- vitest 전체 통과
- `pnpm typecheck` 통과
- `pnpm build` 통과
- Blue/Green 무중단 배포
