// web-adventure (Web MUD CYOA PoC) 타입 정의.
// 1 주차 PoC: 단일 씬 + 단일 엔딩.
//
// 의도:
//   - 직렬화 친화 (모두 plain object). 5 주차에서 Mongo / localStorage 저장 시 그대로 사용.
//   - reducer 가 받는 GameState 는 *phase* 별 discriminated union.

/** 캐릭터 6 스탯. 기본값 5. 시작 보너스 +5 분배(스탯당 최대 +2). */
export type StatKey = "str" | "dex" | "int" | "cha" | "con" | "wis";

/** 어빌리티 1 종 선택. PoC 4 종. 5 주차에 추가 가능. */
export type AbilityKey = "scholar" | "warrior" | "silver_tongue" | "lucky";

export type Character = {
  stats: Record<StatKey, number>;
  hp: number;
  maxHp: number;
  ability: AbilityKey;
  inventory: string[];
  /**
   * 게임 진행 중 누적되는 마커.
   * - boolean: 단발성 플래그 (예: caughtBefore).
   * - number: 4 주차 — 누적 카운터 (예: caughtCount).
   * 조건 검사 `kind: "flag"` 는 `!!flags[key]` 로 체크하므로 양쪽 모두 호환.
   */
  flags: Record<string, boolean | number>;
  rerollsLeft: number;
};

/** 선택지 — 3 종 (plain / probability / conditional). */
export type Choice =
  | { kind: "plain"; id: string; label: string; to: string }
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
       * 예: forest_inner 의 look_around 가 glassesFound=true 일 때 숨김.
       */
      hideWhenFlag?: string;
    }
  | {
      kind: "conditional";
      id: string;
      label: string;
      condition: ChoiceCondition;
      to: string;
      /**
       * 4 주차: 조건 미충족 시 *완전 숨김* (회색 표시 X).
       * - true → 조건 미충족 시 isVisible=false (UI 에서 아예 렌더 X).
       * - false 또는 undefined → 회색 + tooltip (기존 동작 유지).
       */
      hidden?: boolean;
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
  | { kind: "minFlag"; key: string; min: number };

export type Scene = {
  id: string;
  illustration: string;
  title: string;
  body: string[];
  choices: Choice[];
  isEnding?: boolean;
  endingId?: "main" | "spirit" | "fail" | "shopkeeper" | "goblin_friend" | "wizard_apprentice";
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
