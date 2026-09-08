// The web-adventure (Web MUD CYOA PoC) type definitions.
// The week 1 PoC: a single scene with a single ending.
//
// The intent:
//   - serialisation-friendly (all plain objects). Used as they are for the Mongo and localStorage storage in week 5.
//   - the GameState the reducer takes is a discriminated union on *phase*.

/** The character's 6 stats. 5 by default. A starting bonus of +5 is distributed (at most +2 per stat). */
export type StatKey = "str" | "dex" | "int" | "cha" | "con" | "wis";

/**
 * The Fall of Eternia's refresh (#253) - the 4 stigma abilities.
 *   - lunar    the lunar stigma  (learning/intelligence +2)
 *   - selene   the selene stigma (strength/combat +2)
 *   - hecate   the hecate stigma (persuasion/illusion +2)
 *   - none     unmarked          (no magic, immune to petrification, +3 rerolls)
 */
export type AbilityKey = "lunar" | "selene" | "hecate" | "none";

/**
 * The protagonists - 3 starting points. The list is the source and the type is derived (#354).
 *
 * The achievements' denominator (lib/achievements/rules.PROTAGONISTS) and the display order (content/protagonists)
 * each held their own copy of the same array. In #352 the endings went wrong for exactly that reason -
 * "every ending" unlocked at 6 when there were really 11.
 */
export const PROTAGONIST_IDS = ["kael", "rin", "solwen"] as const;

export type Protagonist = (typeof PROTAGONIST_IDS)[number];

/**
 * The ending list - **this is the single source** (#352).
 *
 * This used to be a type (a union) alone, and the mongoose enum, the achievements' denominator and the UI lists each held
 * a hand-copied string array. When #359 and #361 added 5 endings, the past-run model's enum alone did not follow, and every run
 * ending in one of those 5 was discarded as a validation failure (500) - taking the feedback notes, the gallery and the achievements with it. A type
 * cannot see a runtime string array, so TypeScript could not catch it either and it went unnoticed for over two weeks.
 *
 * So **the runtime array is the source and the type is derived from it**. Adding an ending means adding it to this array
 * alone - a map declared as `Record<EndingId, …>` catches it as a type error, and the mongoose enum is caught by
 * `lib/web-adventure/__tests__/ending-ids.test.ts`.
 */
export const ENDING_IDS = [
  "ascension",
  "revolution",
  "harmony",
  "fall",
  "petrification",
  "sylvan_bond",
  /** #359's awakening-route-only endings - the conclusions of the independent story bypassing Omphalos. */
  "liberation",
  "usurpation",
  /** #361's Rin awakening route (conviction and corruption) endings. regency = surviving corrupted, purge = death by another's hand (general), wayfarer = an open ending. */
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
  /** The protagonist's identity. The 3 starting points, and it qualifies some route-only endings. */
  protagonist: Protagonist;
  /**
   * The stigma's contamination (0-100).
   *   - 0-49: normal.
   *   - 50-79: a debuff (-2 on con/dex rolls, +3 on selene magic).
   *   - 80-99: critical (a UI warning plus some magic actions locked).
   *   - 100: the automatic petrification ending.
   */
  stigmaErosion: number;
  inventory: string[];
  flags: Record<string, boolean | number>;
  rerollsLeft: number;
  /** The dynamic text variables (the source for {{key}} substitution). Filled in by Scene.onEnter.setVars and `<<set …>>`. */
  variables?: Record<string, string | number>;
};

/** The choices - 3 kinds (plain / probability / conditional). */
// `pinned` (shared, optional): when a scene's choices exceed the display cap (3) they are narrowed by a random 3-of-N draw.
// pinned=true always shows (excluded from the draw) - so a key progression or story branch is never hidden by chance and
// soft-locks the run. A non-plain branch (conditional/probability) always shows regardless of pinned
// (being an unlock or a challenge, it is not subject to the draw). The draw covers non-pinned plain choices alone.
export type Choice =
  | { kind: "plain"; id: string; label: string; to: string;
      /**
       * #89 - the trace of picking this choice. Branches whose destination scene is the same (meeting the kindred spirit in the alley, the mine's bargain and so on)
       * cannot record which was picked through the scene's onEnter, and the choice vanished. It is recorded here.
       */
      setFlags?: Record<string, boolean>;
      /** #253 - Eternia's contamination change (+N on using magic, -N on using refined water, for instance). */
      stigmaDelta?: number;
      /** Excluded from the random 3-of-N draw and always shown. */
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
       * Week 5 (#221) - the automatic hidden for a *one-off probability branch*.
       * With the given flag truthy, isVisible=false (fully hidden in the UI).
       */
      hideWhenFlag?: string;
      /** #253 - the contamination change from the attempt itself (regardless of success or failure). */
      stigmaDelta?: number;
      /** #253 - the extra contamination change applied *on success only* (separately). */
      stigmaDeltaOnSuccess?: number;
      /** #253 - the extra contamination change applied *on failure only*. */
      stigmaDeltaOnFailure?: number;
      /** Excluded from the random 3-of-N draw and always shown (a probability choice always shows by default). */
      pinned?: boolean;
    }
  | {
      kind: "conditional";
      /** #89 - the trace of picking this choice. The same meaning as on plain. */
      setFlags?: Record<string, boolean>;
      id: string;
      label: string;
      condition: ChoiceCondition;
      to: string;
      /**
       * Week 4: *fully hidden* when the condition is unmet (not shown greyed out).
       */
      hidden?: boolean;
      stigmaDelta?: number;
      /** Excluded from the random 3-of-N draw and always shown (a conditional choice always shows by default). */
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

/** The default BGM played on entering the scene. Absent, the previous BGM continues (or silence). Mid-scene control is the body's `<<bgm …>>` directive. */
export type SceneBgm = {
  /** An audio asset key or a URL (resolved by the host). */
  src: string;
  loop?: boolean;
  /** 0..1 */
  volume?: number;
};

export type Scene = {
  id: string;
  illustration: string;
  /** The array of variation images. Empty, illustration alone is used. */
  illustrations?: string[];
  title: string;
  body: string[];
  /**
   * #73's event skeleton (the canonical text for writing). **It never goes on screen** -
   * with no prose variant it falls back to body.
   */
  treatment?: string[];
  /** #73's per-style bodies, `{ [voice]: string[] }`. Absent, it falls back to body. */
  variants?: Record<string, string[]>;
  choices: Choice[];
  /**
   * The scene's entry BGM (optional). A body paragraph supports the inline script extensions - `{{variable}}` substitution plus
   * the `<< sfx|bgm|fx|img|wait|set … >>` directives (lib/web-adventure/script.ts). With no tokens it behaves exactly as before.
   */
  bgm?: SceneBgm;
  isEnding?: boolean;
  endingId?: EndingId;
  /**
   * The effects granted on entering the scene.
   * - setFlags: merged into character.flags (setting true/false).
   * - addItems: added to character.inventory (avoiding duplicates).
   * - incrementCounters: week 4 - cumulative counters (caughtCount, for example) incremented by 1.
   *   Sharing the same object as flags (boolean | number compatible).
   */
  onEnter?: {
    setFlags?: Record<string, boolean>;
    addItems?: string[];
    incrementCounters?: string[];
    /** #253 - the contamination change on entering the scene. */
    stigmaDelta?: number;
    /** #318 - the HP change on entering the scene (negative = damage, positive = healing). Reaching 0 gives the automatic fall ending. */
    hpDelta?: number;
    /** The change in the reroll count (positive = a top-up). For the protagonist-independent reroll top-up event. */
    rerollDelta?: number;
    /** The dynamic text variables to set on entering the scene (the source for {{key}} substitution). Merged into character.variables. */
    setVars?: Record<string, string | number>;
  };
};

export type SceneRegistry = Record<string, Scene>;

/** GameState - a discriminated union on phase. */
/**
 * The state of a probability roll *awaiting confirmation* - the metadata for showing the result and choosing to reroll or continue.
 * A choice does not transition at once but is held in pendingRoll -> the transition happens on CONFIRM_ROLL.
 */
export type PendingRoll = {
  choiceId: string;
  label: string;
  roll: number; // d20
  bonus: number; // the stigma's bonus
  statValue: number; // the effective stat, with the contamination debuff applied
  difficulty: number;
  success: boolean;
  target: string; // the scene to move to on confirmation (the success/failure branch)
  totalDelta: number; // the contamination delta to apply on confirmation
};

export type GameState =
  | { phase: "creating" }
  | {
      phase: "playing";
      character: Character;
      currentScene: string;
      log: string[];
      /** A probability roll awaiting confirmation - when present, the result plus the reroll/continue UI shows and the ChoiceList is hidden. */
      pendingRoll?: PendingRoll;
    }
  | {
      phase: "ended";
      character: Character;
      endingId: string;
      finalSceneId: string;
      log: string[];
    };
