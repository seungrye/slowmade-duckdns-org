# 〈에테르니아의 추락〉 — 스토리 바이블

> *"세 달이 정렬하는 마지막 사흘, 세 시선이 같은 종말을 향해 걷는다."*

천체 마법공학 다크 에픽. 3 주인공 × 6 엔딩 × 회차 부메랑 시스템.


> 📌 **분기·씬 구조는 DB 가 정답(single source).** 실시간 구조는 [씬 흐름 차트 /scenes/graph](https://slowmade.duckdns.org/scenes/graph), 검증은 `pnpm verify:web-adventure`. 세계관·이미지 설정은 [세계관 & 이미지 가이드 Post](https://slowmade.duckdns.org/post/view/6a292e1d6c7315b6be066016). 이 문서는 *세계관·시스템 개념* 중심이며, 아래 막 구조는 개요만 — 씬 단위 분기는 graph 를 보세요.

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

## 4-6. 막 구조 (상세 분기는 /scenes/graph)

> ⚠️ 씬 단위 분기 트리는 이 문서에서 제거했습니다. 80 씬으로 늘며(추리 시퀀스·호프만 콜백·정찰병 부분성공·분기 31씬 등) ASCII 트리가 계속 stale 되어, DB·graph·lint 를 single source 로 삼습니다.

### 1막 — 각자의 추락과 각성
- **Kael** (솔라리스): 의무동 폐기 통보 → 탈출 → 가솔린 컨테이너 추락 → *폐기물 잔해장(추리: 자신이 연료였음을 파헤침)* → 옴팔로스 외곽
- **Rin** (아이언가드): 검은 연기의 항만 수사 → 사제단 인장 입수 → 상관(호프만)의 배신 → 지하 잠적 → *(호프만을 살려보냈다면 추적자로 재등장)* → 옴팔로스
- **Solwen** (네오엘프): 안개 숲 전투 → 영수의 죽음 → 숲을 떠남 → 옴팔로스

### 2-3막 — 옴팔로스 합류
세 주인공 모두 `omphalos_outskirts` 로 수렴. 외곽 → (블랙마켓 / 다른 주인공 카메오) → 정거장 → **강철 / 지식 / 영혼** 3 길.

### Climax — 3 길 → 6 엔딩
- **강철**: 탈선·탈취(혁명/추락) + *정찰병 희생 부분성공(약화된 의식 → 조화의 문)*
- **지식**: 사제단 거래(승천) / 음모 파훼(조화)
- **영혼**: 세계수 각성(정령의 결속)
- 회차 부메랑(6 world flag)으로 hidden 분기 해금.

상세 분기·조건·확률·도달성은 **/scenes/graph** + `pnpm verify:web-adventure` 로 확인하세요.

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
