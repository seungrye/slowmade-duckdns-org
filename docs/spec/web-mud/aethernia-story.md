# 〈에테르니아의 추락〉 — 스토리 바이블

> *"세 달이 정렬하는 마지막 사흘, 세 시선이 같은 종말을 향해 걷는다."*

천체 마법공학 다크 에픽. 3 주인공 × 6 엔딩 × 회차 부메랑 시스템.

---

## 1. 세계관 핵심

**부유도시 솔라리스** 는 *에테르 가솔린* — 마력석을 정제한 액체 마력 — 으로 떠 있다. 마력의 원천은 *세계수*. 사제단은 *세 달 정렬* 직후 *지상 모든 생명을 연료로 태워 신계 승천* 하려 한다. 아이언가드는 *강철과 증기로 새 시대* 를. 영수 (사슴 형상의 자연 정령) 는 *침묵 속에 잠들어 있다*.

**성흔 침식 (Stigma Erosion)** — 마력을 다룬 자의 신체에 *푸른 결정* 이 자라난다. 50 부터 디버프, 80 부터 임계, **100 도달 시 자동 석화 (petrification) 엔딩**.

**시한부 카운터** — Kael 의 시작 침식 80, 사흘 내 정제소 이송 예정. 매 분기가 카운트다운.

---

## 2. 게임 시스템

### 2.1 6 능력치 + 4 성흔

| 능력치 | probability | minStat |
|---|---|---|
| str | 3 | — |
| dex | 6 | — |
| int | 3 | 1 (priest_deal) |
| cha | 5 | — |
| con | 2 | — |
| wis | 3 | 1 (wisdom_vision) |

| 성흔 | 보너스 | 차별화 분기 |
|---|---|---|
| **lunar** | int +2 (마법공학) | kael_falling/lunar_navigation |
| **selene** | str +2 (전투) | solwen_combat_hard/selene_strike |
| **hecate** | cha +2 (환영) | omphalos_cameo/hecate_illusion |
| **none** (무흔) | 재굴림 +3 | 시스템 의미 (재굴림으로 극복) |

### 2.2 자동 ending 시스템

| 조건 | endingId | 트리거 |
|---|---|---|
| 침식 ≥ 100 | petrification | `isFullyPetrified` (#250) |
| HP ≤ 0 | fall | `isDead` (#318) |
| 시나리오 fail 분기 | 매트릭스 참조 | climax 또는 자결 plain |

### 2.3 누적 데미지 (#318)

RNG 실패 = *즉시 게임오버* 가 아닌 *누적 데미지*. 우회 씬에서 HP/침식 패널티 후 다음 정상 씬으로 합류. *진짜 막다른 결단* (자결/항복) 에서만 시나리오 ending.

| 우회 씬 | 패널티 | 합류 → | 자결 옵션 (#327) |
|---|---|---|---|
| `kael_struggled` | HP -5, 침식 +10 | kael_corridor | → kael_caught |
| `kael_caught_minor` | HP -3, 침식 +3 | kael_cargo_container | — |
| `kael_falling_aftermath` | HP -5, 침식 +5 | omphalos_outskirts | — |
| `kael_cargo_climb_failed` | HP -3, 침식 +3 | kael_falling | — |
| `rin_pursued` | HP -5, 침식 +5 | rin_evidence | → rin_chase |
| `rin_betrayal_aftermath` | HP -10, 침식 +10 | rin_underground | → rin_caught |

### 2.4 회차 부메랑 (6 world flag, 9 분기)

| flag | 출처 endingId | 활용 분기 |
|---|---|---|
| `world.harmony_kept` | harmony | climax_revolution_path/echo_of_harmony |
| `world.world_fell` | fall | omphalos_blackmarket/ashen_informant |
| `world.solaris_strong` | ascension | climax_ascension_path/blessed_descent |
| `world.revolution_won` | revolution | omphalos_outskirts/iron_lookout + rin_evidence/iron_underground |
| `world.last_one_fell` | petrification | kael_corridor/crystal_path_memory + climax_harmony_path/crystal_echo |
| `world.sylvan_awoke` | sylvan_bond | solwen_combat/spirit_guidance + climax_sylvan_path/forest_recognized |

---

## 3. 주인공 3 인

| 주인공 | 한 줄 | 시작 침식 | baseStats | 시작 씬 | 시작 인벤 |
|---|---|---|---|---|---|
| **Kael (카엘)** | 솔라리스 제국 탈영병 · 시한부 | 80 | str 5 / dex 6 / int 7 / cha 4 / con 4 / wis 5 | kael_infirmary | 환자복 + 의료붕대 |
| **Rin (린)** | 아이언가드 수사관 · 침식 초기 | 10 | str 4 / dex 6 / int 7 / cha 6 / con 5 / wis 6 | rin_harbor | 수사관 휘장 + 권총 |
| **Solwen (솔벤)** | 영수 가문 마지막 옥수 | 0 | str 6 / dex 7 / int 5 / cha 5 / con 5 / wis 7 | solwen_grove | 영수 활 + 정령 약초 |

---

## 4. 1막 — 각자의 추락과 각성

### 4.1 Kael 경로 (10 씬)

```
kael_infirmary (시작, probability 3)
  ├ grab_scalpel       (con 12) ✓→ kael_corridor ✗→ kael_struggled
  ├ overload_panel     (str 10) ✓→ kael_corridor ✗→ kael_struggled  (+stigma 3)
  └ fake_flatline      (int 14) ✓→ kael_corridor ✗→ kael_struggled

kael_struggled (우회 #318, HPΔ-5 침식+10)
  ├ to_corridor_injured → kael_corridor
  └ [자결] surrender_petrify → kael_caught  (#327, endingId=petrification)

kael_corridor (분기 3)
  ├ to_cargo_dock        (plain) → kael_cargo_container
  ├ forge_id             (int 15) ✓→ kael_corridor_clear ✗→ kael_caught_minor
  └ [world.last_one_fell] crystal_path_memory (hidden) → kael_corridor_clear

kael_corridor_clear     → kael_cargo_container
kael_caught_minor       (HPΔ-3 침식+3) → kael_cargo_container

kael_cargo_container (분기 1)
  └ climb_in (str 12) ✓→ kael_falling ✗→ kael_cargo_climb_failed  (#326)
kael_cargo_climb_failed → kael_falling

kael_falling (분기 2)
  ├ rise_to_ground       (con 12) ✓→ omphalos_outskirts ✗→ kael_falling_aftermath  (#319)
  └ [lunar] lunar_navigation (hidden, 침식+1) → omphalos_outskirts  (#323)
kael_falling_aftermath → omphalos_outskirts

kael_caught (자결 ending, petrification)
```

### 4.2 Rin 경로 (8 씬)

```
rin_harbor (시작, probability 3)
  ├ shoot_lock     (dex 13) ✓→ rin_evidence ✗→ rin_pursued
  ├ sneak_closer   (dex 11) ✓→ rin_evidence ✗→ rin_pursued
  └ badge_arrest   (cha 14) ✓→ rin_evidence ✗→ rin_pursued

rin_pursued (우회 #318, HPΔ-5 침식+5)
  ├ to_evidence_pursued → rin_evidence
  └ [자수] surrender_chase → rin_chase  (#327, endingId=fall)

rin_evidence (분기 3)
  ├ to_supervisor (plain) → rin_betrayal
  ├ to_press      (plain) → rin_betrayal
  └ [world.revolution_won] iron_underground (hidden) → rin_underground

rin_betrayal (probability 3)
  ├ shoot_first     (dex 14) ✓→ rin_underground ✗→ rin_betrayal_aftermath
  ├ talk_down       (cha 15) ✓→ rin_underground ✗→ rin_betrayal_aftermath
  └ window_escape   (dex 12) ✓→ rin_underground ✗→ rin_betrayal_aftermath

rin_betrayal_aftermath (우회 #318, HPΔ-10 침식+10)
  ├ to_underground_wounded → rin_underground
  └ [자결] surrender_caught → rin_caught  (#327, endingId=fall)

rin_underground → omphalos_outskirts
rin_chase / rin_caught (시나리오 ending)
```

### 4.3 Solwen 경로 (5 씬)

```
solwen_grove (시작, probability 3)
  ├ arrow_first    (dex 11) ✓→ solwen_combat ✗→ solwen_combat_hard
  ├ wake_spirit    (wis 13) ✓→ solwen_combat ✗→ solwen_combat_hard
  └ frighten_chant (cha 12) ✓→ solwen_combat ✗→ solwen_combat_hard

solwen_combat (분기 3)
  ├ shoot_canister  (dex 12) → solwen_grief
  ├ shield_spirit   (wis 13) → solwen_grief
  └ [world.sylvan_awoke] spirit_guidance (hidden, 침식-3) → solwen_grief

solwen_combat_hard (분기 2)
  ├ to_grief (plain) → solwen_grief
  └ [selene] selene_strike (hidden, 침식+3) → solwen_grief  (#325)

solwen_grief (onEnter: setFlags spiritBeastDied)
  ├ to_revenge (plain) → solwen_departure
  └ [wis 7+ minStat] wisdom_vision (hidden, 침식-2) → solwen_departure  (#324, Solwen 전용)

solwen_departure → omphalos_outskirts
```

---

## 5. 2-3막 — 옴팔로스 합류

세 주인공 모두 `omphalos_outskirts` 로 수렴.

```
omphalos_outskirts (분기 3)
  ├ to_station   (plain) → omphalos_station
  ├ to_market    (plain) → omphalos_blackmarket
  └ [world.revolution_won] iron_lookout (hidden) → omphalos_station

omphalos_blackmarket (onEnter: setFlags knowsAscensionPlot + sawOtherProtagonist)
  ├ to_station_after (plain) → omphalos_station
  ├ [sawOtherProtagonist] meet_cameo (hidden) → omphalos_cameo
  └ [world.world_fell] ashen_informant (hidden, 침식-3) → omphalos_station

omphalos_cameo (다른 주인공 카메오, onEnter 침식+1)
  ├ persuade_join    (cha 13) → omphalos_station
  ├ exchange_intel   (wis 13) → omphalos_station  (#320)
  └ [hecate] hecate_illusion (hidden, 침식+2) → omphalos_station  (#321)

omphalos_station (3 접근 방식)
  ├ path_steel     → station_path_steel
  ├ path_knowledge → station_knowledge_branch
  └ path_spirit    → station_spirit_branch
```

### 5.1 세부 분기 트리

```
station_path_steel (분기 3)
  ├ derail            (str 15) → climax_revolution_path / climax_fall_path
  ├ hijack            (int 14) → climax_revolution_path / climax_fall_path
  └ back_to_station   → omphalos_station

station_knowledge_branch (분기 3)
  ├ [knowsAscensionPlot] sabotage_with_knowledge (hidden) → climax_harmony_path
  ├ [int 7+ minStat] priest_deal (hidden, 침식 -2 ability bonus) → climax_ascension_path  (Solwen 차단 design)
  └ back_to_station_2 → omphalos_station

station_spirit_branch (분기 2)
  ├ [spiritBeastDied] spirit_swallow (hidden) → climax_sylvan_path  (Solwen 전용)
  └ back_to_station_3 → omphalos_station
```

---

## 6. Climax — 5 길

```
climax_revolution_path (분기 3)
  ├ join_revolution (plain)                                → ending_revolution
  ├ reject_revolution (plain, 시나리오)                    → ending_fall  ⚠ 막다른 거절
  └ [world.harmony_kept] echo_of_harmony (hidden)          → climax_harmony_path  (회차 부메랑)

climax_ascension_path (분기 2)
  ├ ascend (plain)                                          → ending_ascension
  └ [world.solaris_strong] blessed_descent (hidden, 침식-2) → ending_ascension  (회차 부메랑)

climax_harmony_path (분기 2)
  ├ still_the_engine (wis 17, 실패 시 침식+10 자동 petrification 위험)
                                                            → ending_harmony
  └ [world.last_one_fell] crystal_echo (hidden, 침식-5)     → ending_harmony  (회차 부메랑)

climax_sylvan_path (분기 3)
  ├ embrace_sylvan (plain)                                  → ending_sylvan_bond
  ├ [world.sylvan_awoke] forest_recognized (hidden, 침식-3) → ending_sylvan_bond  (회차 부메랑)
  └ [hasItem: spirit_beast_feather] feather_song (hidden, 침식-5)
                                                            → ending_sylvan_bond  (#322 인벤 활용)

climax_fall_path → ending_fall (witness_fall)
```

---

## 7. 6 Ending + 도달 매트릭스

| 엔딩 | 아이콘 | Kael | Rin | Solwen | 자동? | 주요 조건 |
|---|---|---|---|---|---|---|
| **ascension** | ✨ | ◎ | ◎ | ✗ | — | priest_deal int 7+ (Solwen 차단) |
| **revolution** | ⚙️ | ○ | ◎ | ○ | — | str 15 / int 14 + join |
| **harmony** | ☯ | ○ | ○ | ○ | — | `knowsAscensionPlot` + wis 17 |
| **fall** | 💀 | △ | △ | △ | **HP 0 자동** | reject / witness / 자수 (Rin) / HP 0 |
| **petrification** | 🗿 | ◎ | △ | △ | **침식 100 자동** | 침식 누적 / 자결 (Kael) |
| **sylvan_bond** | 🌿 | ✗ | ✗ | ◎ | — | `spiritBeastDied` flag (Solwen 메인) |

(◎ 메인 / ○ 가능 / △ 조건부 / ✗ 진입 불가)

### 7.1 시나리오 ending 4 (자결/항복 plain)

- `kael_caught` (Kael 항복 → 정제소 자발 이송, endingId=petrification)
- `rin_chase` (Rin 자수 → 추격 종결, endingId=fall)
- `rin_caught` (Rin 자결 → 권총, endingId=fall)
- `climax_fall_path/reject_revolution` (Climax 거절, endingId=fall)

### 7.2 endingsMeta 단일 소스

`src/content/web-adventure/endings.ts` — 각 엔딩의 `title`, `icon`, `epilogue`, `aftermath`. `EndingScreen` 이 endingsMeta 만 사용. `ending_petrification` 씬은 삭제 (#327) — *데이터 자체 미사용* (자동 ending).

---

## 8. 인벤 카탈로그

### 8.1 시작 인벤 (주인공별)

| 주인공 | 아이템 |
|---|---|
| Kael | patient_gown (환자복) + medical_bandage (의료붕대) |
| Rin | investigator_badge (휘장) + service_revolver (권총) |
| Solwen | sylvan_bow (영수 활) + spirit_herb (정령 약초) |

### 8.2 act1 획득 위치

| 씬 | 획득 |
|---|---|
| kael_corridor | ether_refined_water |
| kael_cargo_container | ether_gas_canister, mana_stone_fragment |
| rin_evidence | imperial_seal, ether_refined_water |
| solwen_grief | spirit_beast_feather, mana_stone_fragment |
| omphalos_blackmarket | ether_refined_water, mana_stone_fragment |

### 8.3 hasItem 조건 분기 (#322)

| 분기 | 필요 아이템 | 효과 |
|---|---|---|
| climax_sylvan_path/feather_song | spirit_beast_feather | → ending_sylvan_bond, 침식 -5 |

### 8.4 USE_ITEM 효과 (소비형)

| 아이템 | hp | stigmaDelta |
|---|---|---|
| ether_refined_water | +5 | -3 (정화) |
| mana_stone_fragment | 0 | +5 (마력 누출) |
| medical_bandage | +3 | 0 |

---

## 9. 침식 시스템

| 트리거 | delta | 위치 |
|---|---|---|
| 환경 (`onEnter.stigmaDelta`) | +0~+3 | 옴팔로스/climax/station |
| 마법 확률 *실패* (`stigmaDeltaOnFailure`) | +2~+10 | 마법공학/셀레네/헤카테/지혜 |
| 마법 확률 *공통* (`stigmaDelta`) | +0~+3 | 동일 분기 |
| 아이템 사용 | -3 ~ +5 | 정제수/파편 |
| 우회 씬 진입 | +3~+10 | RNG 실패 |
| 누적 100 도달 | — | 자동 petrification |

## 9.5 HP 시스템 (#318)

| 트리거 | hpDelta |
|---|---|
| 우회 씬 진입 | -3 ~ -10 |
| USE_ITEM (정제수, 의료붕대) | +3 ~ +5 |
| 누적 0 도달 | 자동 fall ending |

---

## 10. 코드 구조 매핑

| 콘텐츠 | 코드 |
|---|---|
| 타입 | `src/types/web-adventure.ts` |
| 주인공 메타 | `src/content/web-adventure/protagonists.ts` |
| 성흔 어빌 | `src/content/web-adventure/abilities.ts` |
| 아이템 카탈로그 | `src/content/web-adventure/items.ts` |
| 엔딩 메타 (epilogue + aftermath) | `src/content/web-adventure/endings.ts` |
| 침식·HP 메커니즘 | `src/lib/web-adventure/engine/stigma.ts` |
| world flag 부메랑 | `src/lib/web-adventure/world-flags.ts` |
| reducer + 다이스 | `src/lib/web-adventure/engine/reducer.ts`, `rollDice.ts` |
| 분기 조건 평가 | `src/lib/web-adventure/engine/choiceFilter.ts` |
| 콘텐츠 lint | `src/lib/web-adventure/lint.ts` |
| UI | `src/app/games/web-adventure/play/*` (CharacterCreator/StatusPanel/SceneRenderer/ChoiceList/EndingScreen/MobileDrawer) |
| 갤러리 | `src/app/games/web-adventure/gallery/*` (EndingGallery/WorldFlagBanner) |
| 그래프 | `src/app/scenes/graph/*` (SceneNode/edgeStyle/Legend) |

---

## 11. 통합 e2e 매트릭스

`src/lib/web-adventure/__tests__/integration-e2e.test.ts` — 실 mongo 그래프 + reducer 13 시나리오:

| 주인공 | 도달 ending |
|---|---|
| Kael | Revolution, Ascension, Harmony, Fall, Petrification |
| Rin | Revolution, Ascension, Harmony, Fall |
| Solwen | Revolution, Harmony, Fall, Sylvan Bond |

도달성 보장: `scripts/web-adventure-branch-reachability.mjs` — **17 conditional 분기 모두 도달 가능** (autoEndingSceneIds 화이트리스트 0 — 모든 씬 reachable).

---

## 12. UI/그래프 (#270, #298)

- **graph 페이지** (`/scenes/graph`) — ReactFlow 노드. 6 endingId 별 색 (amber/red/emerald/gray/slate/lime) + 아이콘 (✨⚙️☯💀🗿🌿). hidden 분기는 점선 + opacity 0.55.
- **EndingScreen** — endingId 별 톤. epilogue + aftermath (#275) 분리. 최종 침식·주인공명 표시 (#294,#295).
- **갤러리** — 6 카드 + n/6 + WorldFlagBanner (#280, 다음 회차 부메랑 시각화).
- **MobileDrawer** — role=dialog + focus 관리 (#296).
- **ChoiceList/CharacterCreator/StatusPanel** — focus-visible ring (#298, #299).

---

## 13. 검증 도구

| 도구 | 명령 | 검증 |
|---|---|---|
| 본문 lint | `pnpm lint:web-adventure` | body 길이, 라벨, endingId enum |
| 구조 lint | `pnpm lint:web-adventure:structure` | orphan/dead-end/3분기/도달성 |
| 도달성 lint | `pnpm lint:web-adventure:reachability` | conditional 분기 통과 가능성 |
| 시드 멱등 | `pnpm test:seed-idempotency` | seeds-replay 2회 → diff 0 |
| 백업 | `pnpm backup:web-adventure` | mongo → JSON, 20 회전 |
| 통합 | `pnpm verify:web-adventure` | structure + reachability |
| 전체 | `pnpm test:all` | typecheck + lint + vitest + seed-idempotency |
| e2e | `pnpm e2e` | Playwright 실 브라우저 (11 시나리오) |

---

## 14. 변경 이력 (요약)

- **#249-257** Phase 1 — 모델 + 30 씬 + 6 엔딩 + 회차 부메랑 + e2e
- **#258-270** UX/콘텐츠 다듬기 — CharacterCreator / 침식 시각화 / NPC / 분기 3 제한 / 부메랑 분기
- **#271-280** 도구/매트릭스 — content lint / analytics / 카메오 / 후일담 / 부메랑 매트릭스 / Playwright / NPC 이름 / backup / WorldFlagBanner
- **#281-290** 운영 안전 — nginx 코드화 / Schema fix / RESTORE 보정 / NaN 방어
- **#291-299** UI/접근성 — 디버프 미리보기 / retry / past-runs limit / 최종 침식 / MobileDrawer ARIA / focus-visible
- **#300-310** 테스트 보강 — 단위 (graph/ChoiceList/InventoryStrip/lint) / e2e (USE_ITEM/petrification/부메랑) / DRY_RUN
- **#311-317** SEO / 보안 / lint 갱신 — sitemap / Next 15.5.18 / content-lint endingId
- **#318** **시스템 재디자인** — HP 0 자동 fall + onEnter.hpDelta + 우회 씬 4 종 + 11 분기 onFailure 재지정
- **#319-326** 스탯/성흔/인벤 균형 — con/wis/str 활용 / ability 시스템 + 3 분기 / hasItem 분기
- **#327** orphan 4 씬 정리 — *_caught/_chase 우회 씬 자결 재이용 + ending_petrification 삭제
