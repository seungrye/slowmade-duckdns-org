# 시스템 설계

## 1. 선택지 시스템

### 1.1 데이터 구조 (TS 타입)

```ts
// 씬 (scene) = 한 화면. 일러스트 1 장 + 텍스트 + 선택지 2~4 개.
type Scene = {
  id: string;                          // "town_square_dawn"
  illustration: string;                // 도트 일러스트 자산 키
  title: string;                       // "마을 광장 — 새벽"
  body: string;                        // 본문 (한국어, 마크다운 일부 허용)
  ambient?: string[];                  // 입장 시 랜덤 분위기 한 줄
  onEnter?: SceneEffect[];             // 입장 시 자동 효과 (스탯 ±, 플래그)
  choices: Choice[];                   // 2~4 개
};

type Choice = {
  id: string;                          // "talk_to_elder"
  label: string;                       // "장로에게 말을 건다"
  kind: ChoiceKind;                    // 상시 / 확률 / 조건
  visibility?: ChoiceCondition;        // 조건 미충족 시 회색 또는 숨김
  cost?: SceneEffect[];                // 선택 시 즉시 효과 (스탯 −, 아이템 소모)
  roll?: StatRoll;                     // 확률 판정용
  outcomes: ChoiceOutcome;             // 결과 (성공/실패 분기)
};

type ChoiceKind = "always" | "roll" | "conditional";

type ChoiceCondition = {
  stats?: Partial<Record<StatKey, number>>;     // { wis: 7 } → 지혜 ≥ 7
  hasItem?: string[];                            // 아이템 ID 보유
  hasAbility?: string[];                         // 어빌리티 보유
  flag?: string;                                 // 플래그 충족
  hideIfFail?: boolean;                          // 미충족 시 숨김 (default false = 회색)
};

type StatRoll = {
  stat: StatKey;                                 // "str"
  difficulty: number;                            // 12 (= 스탯 + d20 ≥ 12 성공)
  modifier?: number;                             // 어빌리티 보정 (예: 학자의 눈 +2)
};

type ChoiceOutcome = {
  goto?: string;                                 // 다음 씬 ID
  onSuccess?: { goto: string; effects?: SceneEffect[] };  // roll 일 때
  onFailure?: { goto: string; effects?: SceneEffect[] };
};

type SceneEffect =
  | { kind: "stat"; stat: StatKey; delta: number }
  | { kind: "hp"; delta: number }
  | { kind: "addItem"; itemId: string; count?: number }
  | { kind: "removeItem"; itemId: string }
  | { kind: "setFlag"; flag: string; value: boolean }
  | { kind: "endGame"; ending: EndingKey };

type StatKey = "str" | "dex" | "int" | "cha" | "con" | "wis";
type EndingKey = "main" | "spirit" | "fail" | "shopkeeper" | "goblin_friend" | "wizard_apprentice";
```

### 1.2 씬 흐름

```
SceneRenderer
  → 1. onEnter 효과 실행 (스탯 ±, 플래그 설정)
  → 2. 일러스트 + 텍스트 표시
  → 3. choices 필터:
       - kind: "always" → 표시
       - kind: "roll" → 표시 + 성공률 계산 (`(20 - difficulty + stat) / 20 × 100 %`)
       - kind: "conditional" → 조건 충족 → 활성, 미충족 → 회색 (이유 tooltip) 또는 숨김
  → 4. 유저 클릭 대기
  → 5. choice.cost 효과 실행
  → 6. roll 이면 주사위 → onSuccess / onFailure 분기
  → 7. outcome.goto 로 다음 씬 이동
```

## 2. 6 스탯 + 시작 보너스

### 2.1 스탯 정의

| 스탯 | 키 | 한국어 | 역할 |
|------|-----|--------|------|
| Strength | `str` | 힘 | 전투 / 물리 강제 / 짐 들기 |
| Dexterity | `dex` | 민첩 | 도주 / 회피 / 손재주 (자물쇠) |
| Intelligence | `int` | 지능 | 수수께끼 / 마법 / 정보 분석 |
| Charisma | `cha` | 카리스마 | 설득 / 거래 / 동료 합류 |
| Constitution | `con` | 건강 | 최대 HP / 독·피로 저항 |
| Wisdom | `wis` | 지혜 | 직관 / 숨겨진 선택지 발견 / 산신령 호감도 |

### 2.2 시작값

- 모든 스탯 = **5** (기본)
- 캐릭터 생성 시 **+5 보너스 분배** (스탯당 최대 +2)
- 결과 범위: 5~7 (편중 시 7/7/6/5/5/5)
- 모험가 이야기는 4 기본 + 18 분배 → 더 거친 편중 가능. 본 기획은 *부드럽게* 시작.

### 2.3 시작 보너스 (어빌리티 — G 옵션 채택 시)

게임 시작 시 *어빌리티 1 개* 선택 (변경 불가, 시작 보너스 분배와 별개):

| 어빌리티 | 효과 | 비고 |
|---------|------|------|
| 학자의 눈 (`scholar`) | 지능 판정 +2 | 지능 분기 유리 |
| 전사의 손 (`warrior`) | 힘 판정 +2 | 전투 분기 유리 |
| 말솜씨 (`silver_tongue`) | 카리스마 판정 +2 | NPC 분기 유리 |
| 행운아 (`lucky`) | 모든 확률 판정 1 회 재굴림 (게임당 **3 회**) | 도박형 |

### 2.4 스탯 증감

- *씬 onEnter* 또는 *choice cost / outcome* 으로 증감
- 예: "산신령에게 안경을 돌려준다" → 지혜 +1, 산신령 호감도 플래그 set
- *영구* 증감만 사용. *임시 버프* 는 MVP 비적용.
- 스탯 상한 = **15** (현실적 cap)

## 3. 확률 판정 공식

```
판정 = stat + d20 + abilityModifier
성공 조건: 판정 ≥ difficulty

예: 스탯 6 + 어빌리티 +2 = 8
    d20 = 1~20
    난이도 12 → 성공: 12 - 8 = 4 이상 굴려야 함 → 17 / 20 = 85 %
```

### 3.1 난이도 가이드

| 난이도 | 의미 | 스탯 5 캐릭 성공률 | 스탯 8 어빌 + 캐릭 성공률 |
|--------|------|-------------------|---------------------------|
| 8 | 매우 쉬움 | 90 % | 100 % |
| 10 | 쉬움 | 80 % | 95 % |
| 12 | 보통 | 70 % | 85 % |
| 14 | 어려움 | 60 % | 75 % |
| 16 | 매우 어려움 | 50 % | 65 % |
| 18 | 극한 | 40 % | 55 % |

### 3.2 성공률 표기 (UX)

- 버튼 옆에 `[힘 70 %]` 표기
- 어빌리티 보정 반영된 *실제* 성공률
- 행운아 어빌 보유 시 `[힘 70 % · 재굴림 2 남음]`

## 4. 조건 선택지

### 4.1 조건 종류

```ts
visibility: {
  stats: { wis: 7 },      // 지혜 ≥ 7
  hasItem: ["compass"],   // 나침반 보유
  hasAbility: ["scholar"], // 학자의 눈 어빌
  flag: "met_elder",      // 장로 만난 적 있음
}
```

### 4.2 미충족 처리

- 기본: **회색 + tooltip** (`지혜 7 이상 필요. 현재 5`)
- `hideIfFail: true` → 완전 숨김 (비밀 선택지)
- 회색이라도 *조건이 무엇인지* 는 보여줘서 유저가 빌드를 학습

## 5. 인벤토리

```ts
type Item = {
  id: string;                         // "rusty_key"
  displayName: string;                // "녹슨 열쇠"
  desc: string;                       // 상세 설명
  icon: string;                       // 도트 아이콘 키
  kind: "weapon" | "consumable" | "key" | "quest" | "misc";
  stackable?: boolean;                // 같은 슬롯 누적
  effect?: SceneEffect[];             // 사용 시 효과 (consumable)
  passiveModifier?: { stat: StatKey; delta: number };  // 보유 중 패시브 (예: 산신령의 안경 +1 지혜)
};

type Inventory = {
  slots: { itemId: string; count: number }[];  // 최대 6~8
  capacity: 8;
};
```

### 5.1 인벤 UX

- 사이드 패널 또는 상단에 *아이콘 그리드*
- 클릭 시 상세 + (consumable 만) "사용" 버튼
- *씬에서 선택지로* 아이템 사용 — *직접 use 명령 X*
- 가득 찼을 때 take 시: 모달 *"빵을 버리고 두루마리를 줍습니다?"*

### 5.2 MVP 아이템 (12 개)

| 아이템 | 종류 | 효과 |
|--------|------|------|
| 검 | weapon | 전투 판정 +1, 힘 판정 +1 |
| 횃불 | misc | 동굴 진입 가능 (조건) |
| 빵 | consumable | HP +20 |
| 약초 | consumable | HP +40 |
| 녹슨 열쇠 | key | 시장 창고 잠금 해제 |
| 두루마리 | quest | 장로 의뢰 증명 |
| 산신령의 안경 | misc | 지혜 +1 패시브, 산신령 호감도 |
| 도깨비 부적 | misc | 도깨비 친구 엔딩 필요 |
| 시장 영수증 | misc | 시장 주인 의심 +1 회피 |
| 비밀 간식 (`super_tintham_cracker`) | quest | 메인 엔딩 필요 |
| 마법서 | quest | 마법사 제자 엔딩 필요, 지능 +1 패시브 |
| 동행 증표 | quest | 동료 분기 진입 |

## 6. 엔딩 분기 트리

```
[start]
  ↓ 캐릭터 생성 (스탯 분배 + 어빌리티 선택)
  ↓
[광장 — 새벽]
  ├─ 장로의 집 → 의뢰 받음 → [accepted]
  └─ 마을 시장 → 영수증 발견 → flag "saw_receipt"
                    ↓
[accepted]
  ├─ 시장 (조건: flag "saw_receipt") → 비밀 창고 진입 (확률: 민첩 12)
  │     ├─ 성공: 비밀 간식 획득 → [carrying]
  │     └─ 실패: 의심 +2 → 실패 진행
  │
  ├─ 숲 (상시) → 산신령 분기 시작
  ├─ 동굴 (조건: 횃불) → 도깨비 분기
  └─ 마법사 (조건: 지능 7) → 마법사 분기
                    ↓
[carrying]
  ├─ 장로에게 전달 (상시) → [메인 클리어]
  └─ 시장 주인 의심 ≥ 3 → [실패 엔딩]
                    ↓
[산신령 분기]
  ├─ 안경 돌려줌 (조건: 산신령의 안경) + 빵 give (확률: 카리스마 12)
  │     ├─ 성공: 산신령 호감도 max → [비밀 루트 엔딩]
  │     └─ 실패: 산신령 분노 → HP −30, 광장 복귀
  └─ 안경 가짐 → 산신령 적대 → 전투 (확률: 힘 14)

[도깨비 분기]
  ├─ 카리스마 판정 (난이도 14)
  │     ├─ 성공: 도깨비 부적 획득 → [도깨비 친구 엔딩 후보]
  │     └─ 실패: 도깨비 도주 → HP −10
  └─ 부적 보유 + 도깨비 시험 통과 → [도깨비 친구 엔딩]

[마법사 분기]
  ├─ 마법서 시험 (지능 ≥ 8) → 마법서 획득
  └─ 마법서 + 마법사 제자 시험 → [마법사 제자 엔딩]

[회사원 엔딩 = 모험 포기 분기]
  └─ 광장에서 "마을에 정착" 선택 (어떤 진행 단계에서도 노출) → [회사원 엔딩]
```

### 6.1 엔딩 6 종 상세

| ID | 이름 | 도달 조건 | 에필로그 텍스트 톤 |
|----|------|---------|------------------|
| `main` | 메인 클리어 | 비밀 간식 + 장로 전달 | "장로는 미소 지으며 비밀 간식을 받았다…" |
| `spirit` | 산신령 동행 | 안경 + 빵 + 카리스마 판정 성공 | "산신령은 당신과 함께 산을 떠났다…" |
| `fail` | 추방 | 의심 ≥ 3 | "마을 사람들이 당신을 쫓아냈다…" |
| `shopkeeper` | 회사원 엔딩 | "마을에 정착" 선택 | "당신은 시장에서 두부를 팔며 평범하게 살았다…" |
| `goblin_friend` | 도깨비 친구 | 도깨비 부적 + 시험 통과 + 메인 무관 | "도깨비는 매일 밤 당신 집에 찾아왔다…" |
| `wizard_apprentice` | 마법사 제자 | 마법서 + 지능 ≥ 8 + 시험 통과 | "당신은 마법사의 탑에서 새 이름을 받았다…" |

### 6.2 회차 시스템

- 클리어 시 회차 +1
- 이전 회차 엔딩이 현 회차 *일부 NPC 대사* 에 반영 (`다시 와줬구나, 모험가`)
- *시작 보너스 분배 / 어빌리티 선택* 은 회차마다 재선택 가능
- 이전 회차에서 획득한 *지식 (= 비밀 선택지의 조건)* 은 유저 머릿속에만 — *게임 데이터에는 carry over 없음* (모험가 이야기 모델)
- (선택) Post-MVP: *3 회차 클리어 시* 특수 어빌리티 unlock

## 7. 저장 모델

### 7.1 MongoDB 컬렉션

```ts
// 컬렉션: webAdventureSaves
type WebAdventureSave = {
  _id: ObjectId;
  userId: string | null;              // Firebase Auth uid. 비로그인은 null + sessionKey
  sessionKey?: string;                 // 비로그인 anon 식별

  runNumber: number;                   // 회차 (1, 2, ...)
  currentSceneId: string;

  character: {
    stats: Record<StatKey, number>;    // { str: 6, dex: 5, ... }
    ability: string;                   // "scholar" 등
    hp: number;
    maxHp: number;                     // 100 + con × 5
    rerollsLeft?: number;              // 행운아 어빌 보유 시
  };

  inventory: { itemId: string; count: number }[];

  flags: Record<string, boolean | number>;   // ad-hoc 분기 플래그 / 카운터 (e.g., "suspicion": 2)

  history: { sceneId: string; choiceId: string; ts: number }[];  // 최근 N 개 (분석)

  startedAt: Date;
  updatedAt: Date;
  completedEnding?: EndingKey | null;
  endedAt?: Date;
};

// 컬렉션: webAdventurePastRuns (회차 별 별도 doc, 위 doc 의 *완료* 상태를 별도 보관)
// → 한 유저가 여러 회차의 엔딩 통계를 가짐
```

### 7.2 저장 정책

- **자동 저장**: 씬 이동 시 (= 선택지 클릭 → 다음 씬 진입) 즉시 디바운스 1 초로 mongo flush
- **수동 저장**: MVP 미지원 — 자동만 (선택지 게임이라 명시 save 불필요)
- **비로그인 → 로그인** 전환 시: localStorage 의 진행도를 mongo 로 1 회 마이그레이션
- **회차 별 별도 doc**: 회차 2 시작 시 새 doc, 회차 1 doc 은 `webAdventurePastRuns` 로 이전

## 8. 컨텐츠 데이터 형식

- 씬·NPC·아이템·대사 등 **컨텐츠는 TS 정적 객체** 로 시작 (MVP)
- 디렉토리: `webapp/src/games/web-adventure/content/scenes/*.ts`
- Post-MVP 에서 *mongo 카탈로그* 전환 (작가용 admin UI)
- 다국어는 MVP 에서 *한국어만*. 영어는 Post-MVP.

### 8.1 씬 정의 샘플

```ts
// content/scenes/town_square_dawn.ts
export const townSquareDawn: Scene = {
  id: "town_square_dawn",
  illustration: "town_square_dawn.png",
  title: "마을 광장 — 새벽",
  body: `
    안개가 천천히 걷히는 광장에 당신은 서 있다.
    우물에서 물긷는 노파가 당신을 흘끔 본다.

    북쪽 길은 숲으로 이어지고, 남쪽엔 장로의 집이 있다.
    서쪽으로 가면 시장이 열리고 있다.
  `,
  ambient: ["멀리서 까마귀 울음 소리가 들린다.", "찬 바람이 옷깃을 스친다."],
  choices: [
    { id: "go_elder", label: "장로의 집으로 간다", kind: "always", outcomes: { goto: "elder_house" } },
    { id: "go_market", label: "시장으로 간다", kind: "always", outcomes: { goto: "market_morning" } },
    { id: "go_forest", label: "숲으로 간다", kind: "always", outcomes: { goto: "forest_entrance" } },
    {
      id: "ask_old_woman",
      label: "노파에게 말을 건다",
      kind: "roll",
      roll: { stat: "cha", difficulty: 10 },
      outcomes: {
        onSuccess: { goto: "old_woman_secret", effects: [{ kind: "stat", stat: "wis", delta: 1 }] },
        onFailure: { goto: "old_woman_refuse" },
      },
    },
  ],
};
```

## 9. 텍스트 출력 규칙

- 한 씬 = 일러스트 1 + 본문 2~5 문단
- *NPC 이름* 은 강조색 (살구 또는 한국 전통 단청 색)
- *아이템 이름* 은 강조색 (청록)
- 선택지 버튼 = 큰 글자, 클릭 영역 충분 (모바일)
- 시스템 메시지 = 별도 토스트 (`[시스템] 지혜 +1`)
- 페이드인 애니메이션 (300 ms)

## 10. 오류 / 엣지 케이스

| 케이스 | 처리 |
|--------|------|
| 모든 선택지 조건 미충족 | "이 곳에서 할 수 있는 일이 없다." + 1 개 *복귀* 선택지 강제 표시 |
| 인벤 가득 + 새 아이템 획득 | 모달 *"하나를 버려야 합니다"* |
| 확률 판정 실패 + 회사원 분기 unlock | 실패 화면에서 *"포기하고 마을로 돌아간다"* 선택지 추가 |
| HP 0 | 광장 부활 + HP 50 + 인벤 유지 + 의심 +1 |
| 회차 1 클리어 도중 새 회차 시작 시 | 모달 확인 *"진행 중인 회차를 포기합니다"* |
| 동시 두 탭 | last-write-wins (MVP) — Post-MVP 에 lock |
