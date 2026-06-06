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

/** 주인공 — 3 갈래 시작점. */
export type Protagonist = "kael" | "rin" | "solwen";

/** 엔딩 6 종 — 에테르니아 리프래시. */
export type EndingId =
  | "ascension"
  | "revolution"
  | "harmony"
  | "fall"
  | "petrification"
  | "sylvan_bond";

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
};

/** 선택지 — 3 종 (plain / probability / conditional). */
export type Choice =
  | { kind: "plain"; id: string; label: string; to: string;
      /** #253 — 〈에테르니아〉 침식도 변동 (예: 마법 사용 시 +N, 정제수 사용 시 -N). */
      stigmaDelta?: number;
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
    }
  | {
      kind: "conditional";
      id: string;
      label: string;
      condition: ChoiceCondition;
      to: string;
      /**
       * 4 주차: 조건 미충족 시 *완전 숨김* (회색 표시 X).
       */
      hidden?: boolean;
      stigmaDelta?: number;
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
  | { kind: "ability"; required: AbilityKey };

export type Scene = {
  id: string;
  illustration: string;
  title: string;
  body: string[];
  choices: Choice[];
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
  };
};

export type SceneRegistry = Record<string, Scene>;

/** GameState — phase 별 discriminated union. */
export type GameState =
  | { phase: "creating" }
  | { phase: "playing"; character: Character; currentScene: string; log: string[] }
  | {
      phase: "ended";
      character: Character;
      endingId: string;
      finalSceneId: string;
      log: string[];
    };
