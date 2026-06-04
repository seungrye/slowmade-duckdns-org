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
  flags: Record<string, boolean>;
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
    }
  | { kind: "conditional"; id: string; label: string; condition: ChoiceCondition; to: string };

export type ChoiceCondition =
  | { kind: "minStat"; stat: StatKey; min: number }
  | { kind: "hasItem"; itemId: string }
  | { kind: "flag"; key: string };

export type Scene = {
  id: string;
  illustration: string;
  title: string;
  body: string[];
  choices: Choice[];
  isEnding?: boolean;
  endingId?: "main" | "spirit" | "fail" | "shopkeeper" | "goblin_friend" | "wizard_apprentice";
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
