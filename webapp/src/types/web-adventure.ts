// web-adventure (Web MUD CYOA PoC) 타입 정의.
// 1 주차 PoC: 단일 씬 + 단일 엔딩.
//
// 의도:
//   - 직렬화 친화 (모두 plain object). 5 주차에서 Mongo / localStorage 저장 시 그대로 사용.
//   - reducer 가 받는 GameState 는 *phase* 별 discriminated union.

/** 캐릭터 6 스탯. 기본값 5. 시작 보너스 +5 분배(스탯당 최대 +2). */
export type StatKey = "str" | "dex" | "int" | "cha" | "con" | "wis";

/**
 * 〈에테르니아의 추락〉 리프래시 (#253) — 성흔 어빌리티 4 종.
 *   - lunar    루나 성흔  (학식/지능 +2)
 *   - selene   셀레네 성흔 (완력/전투 +2)
 *   - hecate   헤카테 성흔 (언변/환영 +2)
 *   - none     무흔        (마법 못 씀, 석화병 면역, 재굴림 +3)
 */
export type AbilityKey = "lunar" | "selene" | "hecate" | "none";

/**
 * 주인공 — 3 갈래 시작점. 목록이 원본이고 타입을 파생한다 (#354).
 *
 * 업적의 분모(lib/achievements/rules.PROTAGONISTS)와 전시 순서(content/protagonists)가
 * 각자 같은 배열을 들고 있었다. #352 에서 엔딩이 정확히 그것 때문에 틀렸다 —
 * 「모든 엔딩」이 6종에서 열렸는데 실제로는 11종이었다.
 */
export const PROTAGONIST_IDS = ["kael", "rin", "solwen"] as const;

export type Protagonist = (typeof PROTAGONIST_IDS)[number];

/**
 * 엔딩 목록 — **여기가 단일 출처다** (#352).
 *
 * 예전엔 이게 타입(union)뿐이었고, mongoose enum·업적 분모·UI 목록은 문자열 배열을 손으로
 * 복사해 뒀다. #359·#361 이 엔딩 5종을 더할 때 past-run 모델의 enum 만 안 따라와서, 그 5종으로
 * 끝낸 회차가 전부 검증 실패(500)로 버려졌다 — 피드백 노트·갤러리·업적까지 통째로. 타입은
 * 런타임 문자열 배열을 못 보니 TypeScript 도 못 잡았고 2주 넘게 몰랐다.
 *
 * 그래서 **런타임 배열을 원본으로 두고 타입을 거기서 파생**한다. 엔딩을 더할 땐 이 배열에만
 * 넣으면 된다 — `Record<EndingId, …>` 로 선언한 맵은 타입 에러로, mongoose enum 은
 * `lib/web-adventure/__tests__/ending-ids.test.ts` 로 빠짐없이 걸린다.
 */
export const ENDING_IDS = [
  "ascension",
  "revolution",
  "harmony",
  "fall",
  "petrification",
  "sylvan_bond",
  /** #359 각성 루트 전용 엔딩 — 옴팔로스를 우회한 독립 스토리의 결말. */
  "liberation",
  "usurpation",
  /** #361 린 각성 루트(신념과 타락) 엔딩. regency=타락 생존, purge=타살死(범용), wayfarer=열린 결말. */
  "regency",
  "purge",
  "wayfarer",
] as const;

export type EndingId = (typeof ENDING_IDS)[number];

export type Character = {
  stats: Record<StatKey, number>;
  hp: number;
  maxHp: number;
  ability: AbilityKey;
  /** 주인공 정체성. 3 갈래 시작점 + 일부 전용 엔딩 자격 결정. */
  protagonist: Protagonist;
  /**
   * 성흔 침식도 (0-100).
   *   - 0-49: 정상.
   *   - 50-79: 디버프 (con/dex 판정 -2, 셀레네 마법 +3).
   *   - 80-99: 임계 (UI 경고 + 마법 액션 일부 잠금).
   *   - 100: 자동 petrification 엔딩.
   */
  stigmaErosion: number;
  inventory: string[];
  flags: Record<string, boolean | number>;
  rerollsLeft: number;
  /** 동적 텍스트 변수({{키}} 치환 소스). Scene.onEnter.setVars / `<<set …>>` 로 채워짐. */
  variables?: Record<string, string | number>;
};

/** 선택지 — 3 종 (plain / probability / conditional). */
// `pinned` (공통, 옵션): 씬 선택지가 표시 상한(3)을 넘을 때 랜덤 3-of-N 으로 추린다.
// pinned=true 면 항상 노출(추첨 제외) — 핵심 진행/스토리 분기가 랜덤으로 가려져 소프트락
// 되지 않게 한다. plain 이 아닌 분기(conditional/probability)는 pinned 여부와 무관하게
// 항상 노출된다(해금·도전 분기라 랜덤 대상 아님). 추첨은 non-pinned plain 만 대상.
export type Choice =
  | { kind: "plain"; id: string; label: string; to: string;
      /**
       * #89 이 선택지를 고른 흔적. 도착 씬이 같은 갈래들(골목의 동류 접촉, 갱도 거래 등)은
       * 씬의 onEnter 로는 어느 쪽을 골랐는지 남길 수 없어 선택이 사라졌다. 여기에 남긴다.
       */
      setFlags?: Record<string, boolean>;
      /** #253 — 〈에테르니아〉 침식도 변동 (예: 마법 사용 시 +N, 정제수 사용 시 -N). */
      stigmaDelta?: number;
      /** 랜덤 3-of-N 추첨에서 제외하고 항상 노출. */
      pinned?: boolean;
    }
  | {
      kind: "probability";
      id: string;
      label: string;
      stat: StatKey;
      difficulty: number;
      onSuccess: string;
      onFailure: string;
      /**
       * 5 주차 (#221) — *일회성 probability 분기* 자동 hidden.
       * 지정된 flag 가 truthy 면 isVisible=false (UI 에서 완전 숨김).
       */
      hideWhenFlag?: string;
      /** #253 — 시도(성공/실패 무관) 자체에 따른 침식도 변동. */
      stigmaDelta?: number;
      /** #253 — *성공 시에만* 추가로 적용되는 침식도 변동 (별도). */
      stigmaDeltaOnSuccess?: number;
      /** #253 — *실패 시에만* 추가로 적용되는 침식도 변동. */
      stigmaDeltaOnFailure?: number;
      /** 랜덤 3-of-N 추첨에서 제외하고 항상 노출(probability 는 기본적으로 항상 노출). */
      pinned?: boolean;
    }
  | {
      kind: "conditional";
      /** #89 이 선택지를 고른 흔적. plain 과 같은 뜻. */
      setFlags?: Record<string, boolean>;
      id: string;
      label: string;
      condition: ChoiceCondition;
      to: string;
      /**
       * 4 주차: 조건 미충족 시 *완전 숨김* (회색 표시 X).
       */
      hidden?: boolean;
      stigmaDelta?: number;
      /** 랜덤 3-of-N 추첨에서 제외하고 항상 노출(conditional 은 기본적으로 항상 노출). */
      pinned?: boolean;
    };

export type ChoiceCondition =
  | { kind: "minStat"; stat: StatKey; min: number }
  | { kind: "hasItem"; itemId: string }
  /**
   * 5 주차 (#221) — `expect` 로 반전 매치 지원.
   * - expect 미정의 또는 true → flag 가 truthy 일 때 충족 (기존 동작).
   * - expect=false → flag 가 미설정/falsy 일 때 충족 (일회성 분기 자동 hidden 용).
   */
  | { kind: "flag"; key: string; expect?: boolean }
  /** 4 주차 — 누적 카운터 (예: caughtCount) 가 min 이상일 때 충족. */
  | { kind: "minFlag"; key: string; min: number }
  /** #321 〈에테르니아〉 — 4 성흔별 특수 분기. character.ability 가 일치할 때만 해금. */
  | { kind: "ability"; required: AbilityKey }
  /** #359 각성 — 침식도(stigmaErosion) 가 min 이상일 때 충족. */
  | { kind: "stigmaAtLeast"; min: number }
  /**
   * #99 — 침식도가 max 이하일 때 충족. 「표식 없는 맨살」처럼 *몸이 아직 성한* 것을 전제하는
   * 선택지에 쓴다. 성흔 능력(ability)과 침식도는 별개 축이라 ability 조건만으로는 못 막는다.
   */
  | { kind: "stigmaAtMost"; max: number }
  /** #359 각성 — 복합 AND. 모든 하위 조건을 만족할 때 충족(각성 다중 조건 게이트용). */
  | { kind: "all"; conditions: ChoiceCondition[] };

/** 씬 진입 시 재생할 기본 BGM. 없으면 이전 BGM 유지(또는 무음). 중간 제어는 body 의 `<<bgm …>>` 디렉티브. */
export type SceneBgm = {
  /** 오디오 에셋 키 또는 URL(→ 호스팅에서 해석). */
  src: string;
  loop?: boolean;
  /** 0..1 */
  volume?: number;
};

export type Scene = {
  id: string;
  illustration: string;
  /** 배리에이션 이미지 배열. 비면 illustration 단일 사용. */
  illustrations?: string[];
  title: string;
  body: string[];
  /**
   * #73 사건의 뼈대(집필용 정본). **화면에 절대 나가지 않는다** —
   * 문체 변형이 없으면 body 로 폴백한다.
   */
  treatment?: string[];
  /** #73 문체별 본문 `{ [voice]: string[] }`. 없으면 body 로 폴백. */
  variants?: Record<string, string[]>;
  choices: Choice[];
  /**
   * 씬 진입 BGM(선택). body 문단은 인라인 스크립트 확장 지원 — `{{변수}}` 치환 +
   * `<< sfx|bgm|fx|img|wait|set … >>` 디렉티브(lib/web-adventure/script.ts). 토큰 없으면 종전과 동일.
   */
  bgm?: SceneBgm;
  isEnding?: boolean;
  endingId?: EndingId;
  /**
   * 씬 진입 시 부여될 효과.
   * - setFlags: character.flags 에 병합 (true/false 설정).
   * - addItems: character.inventory 에 추가 (중복 방지).
   * - incrementCounters: 4 주차 — 누적 카운터 (예: caughtCount) +1 씩 누적.
   *   flags 와 같은 객체를 공유 (boolean | number 호환).
   */
  onEnter?: {
    setFlags?: Record<string, boolean>;
    addItems?: string[];
    incrementCounters?: string[];
    /** #253 — 씬 진입 시 침식도 변동. */
    stigmaDelta?: number;
    /** #318 — 씬 진입 시 HP 변동 (음수 = 데미지, 양수 = 회복). 0 도달 시 자동 fall ending. */
    hpDelta?: number;
    /** 재굴림 횟수 변동 (양수 = 보충). 주인공 무관 재굴림 보충 이벤트용. */
    rerollDelta?: number;
    /** 씬 진입 시 설정할 동적 텍스트 변수({{키}} 치환 소스). character.variables 에 병합. */
    setVars?: Record<string, string | number>;
  };
};

export type SceneRegistry = Record<string, Scene>;

/** GameState — phase 별 discriminated union. */
/**
 * probability 판정 *대기* 상태 — 결과를 보여주고 재굴림/계속을 선택하기 위한 메타.
 * 선택 즉시 전이하지 않고 pendingRoll 에 보관 → CONFIRM_ROLL 시 비로소 전이.
 */
export type PendingRoll = {
  choiceId: string;
  label: string;
  roll: number; // d20
  bonus: number; // 성흔 보너스
  statValue: number; // 침식 디버프 반영된 effective stat
  difficulty: number;
  success: boolean;
  target: string; // 확정 시 이동할 씬 (성공/실패 분기)
  totalDelta: number; // 확정 시 적용할 침식 delta
};

export type GameState =
  | { phase: "creating" }
  | {
      phase: "playing";
      character: Character;
      currentScene: string;
      log: string[];
      /** probability 판정 대기 — 있으면 결과+재굴림/계속 UI 표시, ChoiceList 숨김. */
      pendingRoll?: PendingRoll;
    }
  | {
      phase: "ended";
      character: Character;
      endingId: string;
      finalSceneId: string;
      log: string[];
    };
