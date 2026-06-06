# 〈에테르니아의 추락〉 스토리 바이블

> The Fall of Aethernia — 천체 마법공학 다크 에픽 판타지 세계관.
>
> 시간이 지나면서 마법의 원천이 변해감에 따라 발생하는 국가 간의 갈등과 생존을 다룬다.

## 0. 메타

- 코드 리프래시 마커: `#253` (Phase 1a/1b/1c)
- 콘텐츠 단일 소스: mongo `webadventurescenes` collection
- 백업 (옛 한국 사극 30 씬): `webapp/scripts/backups/web-adventure-pre-aethernia-2026-06-05T19-13-42-748Z.json`
- 시드 스크립트:
  - `scripts/seed-kael-act1.mjs` — Kael 1막
  - `scripts/seed-rin-act1.mjs` — Rin 1막
  - `scripts/seed-solwen-act1.mjs` — Solwen 1막
  - `scripts/seed-act23-omphalos.mjs` — 옴팔로스 2-3막 + 6 엔딩

---

## 1. 세계관 핵심

### 1.1 마법 시스템

- **천문 마법**: 마법은 세 달(루나/셀레네/헤카테)의 위치·정렬에 따라 힘이 결정.
- **성흔 (Stigma)**: 인간은 태어날 때 달의 기운을 받아 신체에 성흔이 새겨진다. 마법 사용은 성흔을 매개로 한다.
- **석화병**: 마법을 과도하게 사용하면 성흔이 신체를 파먹어 마력석으로 변해 죽는다. 게임의 *침식도 카운터* (0-100) 가 이를 시각화.
- **에테르 가솔린**: 마법 생명체의 피와 마력석을 정제한 액체 연료. 현재 시대의 마법공학 사회는 이 연료를 주입한 기계 무기·증기 기관에 의존.

### 1.2 세 세력

| 세력 | 지리 | 성격 |
|---|---|---|
| **솔라리스 제국** (Empire of Solaris) | 고대 드래곤 뼈 위 공중 부유 도시 | 천문대-사제단이 황권 장악. 지상에서 에테르 가솔린 착취. |
| **아이언가드 공국** (Principality of Irongard) | 검은 연기로 가득 찬 광산·공업 도시 | 드워프 제련 + 인간 마법공학. 솔라리스 수탈에 맞서 혁명 준비. |
| **네오-엘프 자치령** (Sylvan Dominion) | 세계수 내부 어두운 숲 | 고전 정령 마법 고수. 영수 사냥하는 인간 증오. |

### 1.3 핵심 갈등 — 예언의 실현

- 100 년 전 천문대-사제단 발표: **"세 달이 완전히 겹치는 날, 지상의 모든 마력이 소멸하고 공중 도시들이 추락한다."**
- 예언의 날이 다가올수록 지상 마력 밀도 급감.
- 부유 도시를 띄울 마력이 부족해진 솔라리스 → 지상의 연료 강탈 → **에테르 전쟁**.
- **진실 (스포일러)**: 사제단의 *Ascension 의식* 은 세계를 구하는 것이 아니라, 지상의 모든 생명(세계수, 인간)을 연료로 태워 *자신들만 신계로 오르려는 사기극*.

---

## 2. 게임 시스템

### 2.1 캐릭터

- **6 스탯**: str(완력) / dex(민첩) / int(지능) / cha(언변) / con(체력) / wis(지혜).
- **HP**: `100 + con × 5`.
- **성흔 어빌리티 4 종**:
  - `lunar` 루나 — 지능 판정 +2
  - `selene` 셀레네 — 완력 판정 +2
  - `hecate` 헤카테 — 언변 판정 +2
  - `none` 무흔 — 마법 못 씀. 석화병 면역. 재굴림 +3.

### 2.2 성흔 침식 카운터 (0-100)

| 구간 | 상태 | 효과 |
|---|---|---|
| 0-49 | 정상 | 디버프 없음 |
| 50-79 | 디버프 | con/dex 판정 -2. (UI: "손끝이 딱딱하게 굳어갑니다") |
| 80-99 | 임계 | 디버프 유지. 일부 마법 선택지 봉쇄 가능. |
| 100 | 자동 petrification 엔딩 | 회차 강제 종결. |

**아이템 톤**:
- `ether_refined_water` 에테르 정제수 — 침식 -3 (귀함)
- `mana_stone_fragment` 마력석 파편 — 일시 보너스, 침식 +5 (하이리스크 하이리턴)

### 2.3 회차 / 갤러리 / 부메랑

- 한 회차 = 한 주인공의 한 엔딩.
- `WebAdventurePastRun` 으로 누적. 갤러리 (`/games/web-adventure/gallery`) 에서 6 엔딩 도달률 확인.
- **world flag 부메랑** (#256): 이전 회차 `endingId` 가 다음 회차 `character.flags` 에 `world.*` flag 로 주입.
  - `ascension` → `world.solaris_strong` (사제단 강화)
  - `revolution` → `world.revolution_won` (아이언가드 무장)
  - `harmony` → `world.harmony_kept`
  - `fall` → `world.world_fell`
  - `petrification` → `world.last_one_fell`
  - `sylvan_bond` → `world.sylvan_awoke` (영수 깨어남)
- 씬의 `conditional` 분기가 이 flag 를 검사해 *다른 결말 / 단서 / NPC* 제공.

---

## 3. 주인공 3인

### 3.1 Kael 카엘 — 솔라리스 탈영병 (시한부)

- **시작**: 의무실, 침식 **80**, 환자복+의료용 붕대.
- **컨셉**: 마법 과다 사용으로 시한부 판정. 제국이 자신을 *에테르 연료 정제기* 로 폐기하려는 것을 엿듣고 탈출 결심.
- **튜토리얼**: 시한부 = 자연스러운 플레이 압박. 침식 카운터 학습.
- **메인 루트**: ascension / harmony / petrification.

### 3.2 Rin 린 — 아이언가드 하급 수사관

- **시작**: 검은 항만, 침식 **10**, 수사관 배지+지급 권총.
- **컨셉**: 에테르 가솔린 밀수 조사 중 *사제단 인장* 발견 → 상관이 *암살 시도* → 잠적.
- **메인 루트**: revolution / harmony / fall.

### 3.3 Solwen 솔벤 — 네오-엘프 옥수

- **시작**: 세계수 사냥터, 침식 **0**, 정령 활+영초.
- **컨셉**: 영수 사냥하는 인간 밀렵단과 교전 → 영수 사망 → 세계수 원천 파괴 인지 → 복수.
- **메인 루트**: sylvan_bond / harmony / fall.

---

## 4. 1막 — 각자의 추락과 각성

### 4.1 Kael 경로

1. **Scene 01 kael_infirmary** 폐기 처분 통보 (의무실) — 3 선택지:
   - [완력 con 12] 메스 grab
   - [셀레네 마법 str 10, 침식 +3] 배선반 폭발
   - [지능 int 14] 가사 위장
2. **Scene 02 kael_corridor** 의무동 복도 — 수송선 도크 / 위조 강하정 분기.
3. **Scene 02b kael_corridor_clear** 위조 성공 → 결국 수송선.
4. **Scene 03 kael_cargo_container** 가솔린 통 잠입 (`ether_gas_canister` 획득).
5. **Scene 04 kael_falling** 추락 → 지상 옴팔로스 외곽.
6. **Scene 01b kael_caught** 적발 → 즉시 petrification.

### 4.2 Rin 경로

1. **Scene 01 rin_harbor** 검은 항만, 밀수 적발 — 3 선택지 (권총/은밀/배지).
2. **Scene 02 rin_evidence** 사제단 인장 발견 (`imperial_seal` 획득).
3. **Scene 03 rin_betrayal** 상관의 권총 — 3 선택지 (선제/언변/창문).
4. **Scene 04 rin_underground** 지하 잠적 → 옴팔로스.
5. **rin_chase / rin_caught** 실패 분기 → fall.

### 4.3 Solwen 경로

1. **Scene 01 solwen_grove** 안개 낀 사냥터 — 3 선택지 (활/영수 깨움/환영).
2. **Scene 02 solwen_combat** 전투의 한가운데 — 가솔린 통/환영 안개.
3. **Scene 02b solwen_combat_hard** 너무 늦은 분기.
4. **Scene 03 solwen_grief** 영수의 죽음 (`spirit_beast_feather` 획득, `spiritBeastDied` flag).
5. **Scene 04 solwen_departure** 숲을 떠남 → 옴팔로스.

---

## 5. 2-3막 — 옴팔로스 합류

세 주인공이 *동일한 사건* — *에테르 가솔린 열차 탈취 작전* — 에서 마주친다. 직접 만남보다 *엇갈리는 영향* 위주.

### 5.1 합류 흐름

1. **Scene 05 omphalos_outskirts** 옴팔로스 외곽 — 역 / 블랙마켓 분기.
2. **Scene 06 omphalos_blackmarket** 정보상에게 *사제단 의식 진실* 구입 (`knowsAscensionPlot` flag).
3. **Scene 07 omphalos_station** 가솔린 열차 — 분기 *3 단계 트리* (#262 — UX 정책: 한 씬 ≤ 3 분기).
   - `path_steel` → **Scene 07a station_path_steel** — `derail` [str 15] / `hijack` [int 14] → climax_revolution_path 또는 climax_fall_path. 실패 시 `stigmaDeltaOnFailure` 추가 침식.
   - `path_knowledge` → **Scene 07b station_knowledge_branch** — `sabotage_with_knowledge` [knowsAscensionPlot, hidden] → climax_harmony_path / `priest_deal` [int **7+** — Solwen 차단 design 의도] → climax_ascension_path.
   - `path_spirit` → **Scene 07c station_spirit_branch** — `spirit_swallow` [spiritBeastDied, hidden] → climax_sylvan_path.

### 5.2 클라이맥스 8 씬

각 분기의 *최종 결단* 1 씬 → 엔딩 씬.

- **8H climax_harmony_path** 의식 발화기 동조 — 지혜 17.
- **8R climax_revolution_path** 강철의 손에 열차 — 동참 / 거절.
- **8S climax_sylvan_path** 세계수의 뿌리 — 숲의 일부 되기.
- **8A climax_ascension_path** 사제단 합류 → 승천.
- **8F climax_fall_path** 모든 것 흐트러짐 — 추락 목격.

---

## 6. 엔딩 6 종 + 도달 매트릭스

| 엔딩 | 아이콘 | Kael | Rin | Solwen | 주요 조건 |
|---|---|---|---|---|---|
| **ascension** 승천 | ✨ | ◎ | ◎ | ✗ | 사제단 거래. int **7+**. Solwen design 차단. |
| **revolution** 혁명 | ⚙️ | ○ | ◎ | ○ | str 15 또는 int 14 + 동참. |
| **harmony** 조화 | ☯ | ○ | ○ | ○ | `knowsAscensionPlot` + wis 17. |
| **fall** 추락 | 💀 | △ | △ | △ | 시간 제한 실패 / 거절. |
| **petrification** 석화 | 🗿 | ◎ | △ | △ | 침식 100. Kael 무조건 위험. |
| **sylvan_bond** 정령 결속 | 🌿 | ✗ | △ | ◎ | `spiritBeastDied` flag. |

(◎ 메인 루트 / ○ 가능 / △ 조건부 / ✗ 진입 불가)

### 6.1 엔딩 컨테이너 톤 (EndingScreen.tsx)

- ascension: indigo (신비)
- revolution: orange (불꽃)
- harmony: emerald (생명)
- fall: gray (잿더미)
- petrification: slate (마력석)
- sylvan_bond: lime (숲)

---

## 7. 코드 구조 매핑

| 콘텐츠 | 코드 |
|---|---|
| 세계관/메타 | `src/types/web-adventure.ts` (Protagonist / EndingId / AbilityKey) |
| 주인공 메타 | `src/content/web-adventure/protagonists.ts` |
| 성흔 어빌 | `src/content/web-adventure/abilities.ts` |
| 아이템 카탈로그 | `src/content/web-adventure/items.ts` |
| 엔딩 메타 (한국어 에필로그) | `src/content/web-adventure/endings.ts` |
| 침식 메커니즘 | `src/lib/web-adventure/engine/stigma.ts` |
| world flag 부메랑 | `src/lib/web-adventure/world-flags.ts` |
| reducer + 다이스 | `src/lib/web-adventure/engine/reducer.ts`, `rollDice.ts` |
| UI: 주인공 카드 | `src/app/games/web-adventure/play/CharacterCreator.tsx` |
| UI: StatusPanel / EndingScreen / Gallery | `play/StatusPanel.tsx`, `play/EndingScreen.tsx`, `gallery/EndingGallery.tsx` |

---

## 8. 침식 가속 시스템 (#263 / #264)

침식이 단순 *주인공 결정* 만의 함수가 아닌, *환경* 과 *마법 실패* 의 누적이다.

| 트리거 | delta | 위치 |
|---|---|---|
| 환경 (`onEnter.stigmaDelta`) | +1~+3 | 옴팔로스 외곽/역/블랙마켓, 4 climax 씬, station 간 단계 |
| 마법 확률 *실패* (`stigmaDeltaOnFailure`) | +2~+10 | 셀레네/헤카테/마법공학/지혜 분기. 지혜 의식 동조는 +10 (최대 부담) |
| 마법 확률 *성공/공통* (`stigmaDelta`) | +2~+3 | 동일 분기들 |
| 아이템 사용 (`item.stigmaDelta`) | -3 (정제수) / +5 (마력석 파편) | USE_ITEM 시 |
| 자연 누적 (∑ ≥ 100) | — | reducer 가 자동 `petrification` ending 으로 전환 |

## 9. Harmony 자격 확장 (#265)

블랙마켓 진입 시 두 flag 가 동시에 set:

- `knowsAscensionPlot` — sabotage_with_knowledge 자격
- `sawOtherProtagonist` — *다른 주인공과의 짧은 마주침* (Harmony 의 "함께 숨 쉰다" 톤 강화). 추후 신규 분기 자격으로 사용.

## 9.5 act1 회차 부메랑 (#283)

이전 회차의 결과가 *다음 회차의 act1 진행* 도 살짝 다르게 만든다. 본 분기 흐름 유지 + *짧은 우회 가지* (hidden conditional).

| 씬 | 조건 flag | hidden 분기 | 효과 |
|---|---|---|---|
| `kael_corridor` | `world.last_one_fell` | `crystal_path_memory` — 옛 카엘의 결정체 빛 안내 | → kael_corridor_clear, 침식 -2 |
| `rin_evidence` | `world.revolution_won` | `iron_underground` — 본부 보고 우회 | → rin_underground, betrayal 우회 |
| `solwen_combat` | `world.sylvan_awoke` | `spirit_guidance` — 영수의 노래 안내 | → solwen_grief, 침식 -3 |

매트릭스 (#272/#276) 가 *climax 단계* 의 회차 부메랑이라면, 본 시스템은 *act1 단계* 의 약한 부메랑. *덜 극적이지만 매 회차 진행에 영향*.

## 10. UI/그래프 (#270)

- **Legend** — 〈에테르니아〉 6 엔딩 라벨 (✨ 승천 / ⚙️ 혁명 / ☯ 조화 / 💀 추락 / 🗿 석화 / 🌿 정령의 결속) + 엣지 4 종.
- **ENDING_COLOR** (sceneNode.tsx) — 6 색 매핑 (amber/red/emerald/gray/indigo/lime).
- **ENDING_ICON** — `endings.ts` 의 `endingsMeta.icon` 을 단일 소스.

## 11. 통합 e2e 매트릭스 (#269)

`src/lib/web-adventure/__tests__/integration-e2e.test.ts` — 실제 mongo 그래프 + reducer 시뮬레이션:

| 시나리오 | 검증 단계 수 |
|---|---|
| Kael → Revolution (path_steel/derail) | 8 |
| Kael → Ascension (path_knowledge/priest_deal int 7) | 9 |
| Kael → Harmony (knowsAscensionPlot + still_the_engine) | 9 |
| Kael → Fall (reject_revolution) | 8 |
| Rin → Revolution | 8 |
| Solwen → Sylvan Bond (spiritBeastDied + spirit_swallow) | 8 |
| Kael → Petrification (파편 4 USE → 100 자동) | 4 |

결정적 RNG `() => 0.99` 주입으로 모든 probability success 보장.

## 12. 후속 계획

- [ ] painter-bot 으로 각 씬 다크 톤 일러스트 생성 (현재 placeholder-square.svg) — **외부 quota 대기**
- [x] StatusPanel 의 침식도 시각화 (80+ 시 푸른 결정 이펙트, 심장 박동) — #259
- [x] 옴팔로스의 *블랙마켓에서 다른 주인공과 짧은 마주침* (Harmony 진입 자격 flag) — #265
- [x] 사이드 NPC: 군의관 / 정보상 / 영수 / 행상인 (이름 + 1-2 줄 대사) — #260, #267
- [x] e2e 통합 테스트의 *mongo content fetch* mock + 실제 씬 그래프 시뮬레이션 — #269
- [ ] 페이지 헤더 문구를 〈에테르니아의 추락〉 톤으로 — 일부 #268 (CharacterCreator)
- [ ] Phase 2 — 옴팔로스 *심층* 확장 (H)
- [ ] Phase 3 — 엔딩별 후일담 씬 (I)
- [ ] 다중 회차 매트릭스 명시 + 테스트 (J)

---

## 변경 이력

- **#249** (Phase 1a) 모델 변경 + 백업.
- **#250** reducer 침식 카운터.
- **#251** CharacterCreator 3 주인공 + 4 성흔.
- **#252** Kael 1막 적치.
- **#253** Rin 1막 적치.
- **#254** Solwen 1막 적치.
- **#255** 옴팔로스 2-3막.
- **#256** 6 엔딩 + world flag 부메랑.
- **#257** e2e 풀 플레이 (최소 그래프).
- **#258** CharacterCreator 스탯 분배 제거 + USE_ITEM stigmaDelta 통합.
- **#259** StatusPanel 침식 시각화 (debuff/critical 단계).
- **#260** 사이드 NPC 추가 대사 (act1).
- **#261** 정제수/파편 획득 위치 5 씬 + ascension priest_deal int 7 fix.
- **#262** omphalos_station 5 → 3 분기 (station_path_steel/knowledge_branch/spirit_branch).
- **#263** 마법 확률 *실패* 시 stigmaDeltaOnFailure (6 분기, +2~+10).
- **#264** 환경 침식 onEnter.stigmaDelta (10 씬, +1~+3).
- **#265** Harmony 자격 확장 — sawOtherProtagonist flag.
- **#266** EndingGallery 6 신규 엔딩 검증.
- **#267** 약한 씬 (≤2줄) 4 곳에 NPC 대사 (≥3줄 lint).
- **#268** CharacterCreator 다크 에픽 톤 ("너의 운명을 선택하라").
- **#269** 통합 e2e — 실제 mongo 그래프 7 시나리오 + `omphalos_outskirts` content 버그 발견·수정.
- **#270** graph 범례 + sceneNode 색상 — 옛 사극 → 〈에테르니아〉 6 엔딩 매핑.
