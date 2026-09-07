// The game state machine - transitions per phase.
//
// Actions:
//   START_GAME — creating → playing
//   MAKE_CHOICE - handles the current scene's choice while playing (plain/probability/conditional)
//   USE_ITEM - uses a consumable from the inventory (HP restored, item consumed) - week 3
//   REROLL - rerolls the last probability check (consuming rerollsLeft) - week 3
//   END_GAME - playing -> ended (a forced end)
//   RESET - back to creating
//
// Rules:
//   - a destination scene with isEnding=true moves automatically to the ended phase.
//   - a probability check is computed from the *effectiveStat* (passives included).
//   - the inventory caps at 8 - anything over that in addItems is ignored.
//   - the rng argument is for injecting determinism in tests.

import type {
  Character,
  Choice,
  ChoiceCondition,
  GameState,
  Scene,
  SceneRegistry,
} from "@/types/web-adventure";
import { rollProbability } from "./rollDice";
import { effectiveStat } from "./stats";
import { applyStigmaDelta, isFullyPetrified, isDead, stigmaDebuff } from "./stigma";
import { items, INVENTORY_CAP } from "@/content/web-adventure/items";

export type Action =
  | { type: "START_GAME"; character: Character; startScene: string }
  | { type: "MAKE_CHOICE"; choiceId: string; rng?: () => number }
  | { type: "USE_ITEM"; itemId: string }
  | { type: "REROLL"; rng?: () => number }
  // probability 판정 대기(pendingRoll)를 확정 — 비로소 씬 전이 + stigma/hp 적용.
  | { type: "CONFIRM_ROLL" }
  | { type: "END_GAME"; endingId: string }
  | { type: "RESET" }
  // #238 — 저장에서 불러올 때. character + currentSceneId 로 playing 즉시 진입.
  | { type: "RESTORE"; character: Character; currentSceneId: string };

/**
 * Adds the trace a choice leaves to the character's flags (#89).
 * Existing flags are not removed. Nothing is touched once it has moved to an ending (there is no further use).
 */
function applyChoiceFlags(state: GameState, setFlags?: Record<string, boolean>): GameState {
  if (!setFlags || Object.keys(setFlags).length === 0) return state;
  if (state.phase !== "playing") return state;
  return {
    ...state,
    character: { ...state.character, flags: { ...state.character.flags, ...setFlags } },
  };
}

function evalCondition(cond: ChoiceCondition, character: Character): boolean {
  switch (cond.kind) {
    case "minStat":
      return effectiveStat(character, cond.stat) + stigmaDebuff(character, cond.stat) >= cond.min;
    case "hasItem":
      return character.inventory.includes(cond.itemId);
    case "flag": {
      // Week 5 (#221) - an inverted match through expect. Undefined defaults to true (preserving the existing behaviour).
      const expected = cond.expect ?? true;
      const actual = character.flags[cond.key] === true;
      return actual === expected;
    }
    case "minFlag": {
      const v = character.flags[cond.key];
      const num = typeof v === "number" ? v : v === true ? 1 : 0;
      return num >= cond.min;
    }
    // #321 - special branches per stigma (lunar/selene/hecate/none).
    case "ability":
      return character.ability === cond.required;
    // #359 awakening - a contamination threshold.
    case "stigmaAtLeast":
      return character.stigmaErosion >= cond.min;
    // #99 - a choice that presumes an unharmed body, such as "unmarked bare skin".
    case "stigmaAtMost":
      return character.stigmaErosion <= cond.max;
    // #359 awakening - a composite AND (every sub-condition must hold).
    case "all":
      return cond.conditions.every((c) => evalCondition(c, character));
  }
}

/**
 * The onEnter.addItems merge rules (#203).
 * - Stops at once when the inventory reaches the cap.
 * - An id not in the catalogue is skipped.
 * - stackable=false and already held is skipped (preventing duplicates on re-entry).
 * - stackable=true is pushed as is (accumulating the count).
 */
function pushItems(inventory: string[], toAdd: string[]): string[] {
  const result = [...inventory];
  for (const id of toAdd) {
    if (result.length >= INVENTORY_CAP) break; // the cap - anything over is ignored.
    const item = items[id];
    if (!item) continue; // an undefined id is ignored.
    if (!item.stackable && result.includes(id)) continue; // non-stackable duplicates are blocked.
    result.push(id);
  }
  return result;
}

/** Applies a scene's onEnter - setFlags, addItems, incrementCounters and stigmaDelta onto the character. */
function applyOnEnter(character: Character, scene: Scene): Character {
  if (!scene.onEnter) return character;
  const { setFlags, addItems, incrementCounters, stigmaDelta, hpDelta, rerollDelta, setVars } = scene.onEnter as {
    setFlags?: Record<string, boolean>;
    addItems?: string[];
    incrementCounters?: string[];
    stigmaDelta?: number;
    hpDelta?: number; // #318 - the HP change (negative is damage, positive healing).
    rerollDelta?: number; // the change in rerolls (positive replenishes).
    setVars?: Record<string, string | number>; // dynamic text variables (the source for {{key}} substitution).
  };
  const flagsChanged = setFlags && Object.keys(setFlags).length > 0;
  const itemsChanged = addItems && addItems.length > 0;
  const countersChanged = incrementCounters && incrementCounters.length > 0;
  const stigmaChanged = typeof stigmaDelta === "number" && stigmaDelta !== 0;
  const hpChanged = typeof hpDelta === "number" && hpDelta !== 0 && Number.isFinite(hpDelta);
  const rerollChanged = typeof rerollDelta === "number" && rerollDelta !== 0 && Number.isFinite(rerollDelta);
  const varsChanged = setVars && Object.keys(setVars).length > 0;
  if (!flagsChanged && !itemsChanged && !countersChanged && !stigmaChanged && !hpChanged && !rerollChanged && !varsChanged) return character;
  let nextFlags: Record<string, boolean | number> = character.flags;
  if (flagsChanged || countersChanged) {
    nextFlags = { ...character.flags };
    if (flagsChanged && setFlags) Object.assign(nextFlags, setFlags);
    if (countersChanged && incrementCounters) {
      for (const key of incrementCounters) {
        const prev = nextFlags[key];
        const prevNum = typeof prev === "number" ? prev : 0;
        nextFlags[key] = prevNum + 1;
      }
    }
  }
  const nextInventory = itemsChanged
    ? pushItems(character.inventory, addItems!)
    : character.inventory;
  let next: Character = { ...character, flags: nextFlags, inventory: nextInventory };
  if (stigmaChanged) next = applyStigmaDelta(next, stigmaDelta);
  // #318 - applying HP (clamped to [0, maxHp]).
  if (hpChanged) {
    const safeHp = Math.max(0, Math.min(next.maxHp, next.hp + hpDelta));
    next = { ...next, hp: safeHp };
  }
  // replenishing rerolls (never negative).
  if (rerollChanged) {
    next = { ...next, rerollsLeft: Math.max(0, next.rerollsLeft + rerollDelta) };
  }
  // merging the dynamic text variables (the source for {{key}} substitution).
  if (varsChanged) {
    next = { ...next, variables: { ...(next.variables ?? {}), ...setVars } };
  }
  return next;
}

/** Moves to a scene - a destination with isEnding moves to ended. The character is updated after onEnter is applied.
 *
 * #250 - additionally, *the preceding stigmaDelta* (the choice's stigmaDelta plus any success/failure extra) is
 *   accumulated *before* onEnter is applied. Contamination reaching 100 as a result gives the automatic
 *   petrification ending (taking priority even when target.isEnding is false).
 */
function moveTo(
  prev: Extract<GameState, { phase: "playing" }>,
  targetSceneId: string,
  scenes: SceneRegistry,
  logEntry: string,
  preStigmaDelta = 0,
): GameState {
  const target = scenes[targetSceneId];
  if (!target) return prev; // An undefined scene - safely unchanged.
  // #348 - the flow log: pushes the choice's label plus the next scene's title and body.
  //   It enriches EndingScreen's *choice log* so the scenario's connections can be reviewed.
  const nextLog = [
    ...prev.log,
    `→ ${logEntry}`,
    `▶ ${target.title} (${target.id})`,
    ...target.body.map((b) => `  ${b}`),
  ];
  let character = prev.character;
  if (preStigmaDelta) character = applyStigmaDelta(character, preStigmaDelta);
  character = applyOnEnter(character, target);
  // #250 - the automatic petrification (*lower priority* than an explicit isEnding - target.isEnding wins).
  if (target.isEnding) {
    return {
      phase: "ended",
      character,
      endingId: target.endingId ?? "fall",
      finalSceneId: target.id,
      log: nextLog,
    };
  }
  if (isFullyPetrified(character)) {
    return {
      phase: "ended",
      character,
      endingId: "petrification",
      finalSceneId: target.id,
      log: [...nextLog, "성흔 침식이 한계에 도달했다. 몸이 굳어간다…"],
    };
  }
  // #318 - the automatic fall ending at HP 0. An RNG failure now means *accumulated damage* rather than an immediate scripted ending.
  if (isDead(character)) {
    return {
      phase: "ended",
      character,
      endingId: "fall",
      finalSceneId: target.id,
      log: [...nextLog, "체력이 한계에 도달했다. 더 이상 일어설 수 없다…"],
    };
  }
  return {
    phase: "playing",
    character,
    currentScene: target.id,
    log: nextLog,
  };
}

function findChoice(scene: Scene, choiceId: string): Choice | undefined {
  return scene.choices.find((c) => c.id === choiceId);
}

/** Removes *only the first one* from the inventory. */
function removeFirst(arr: string[], target: string): string[] {
  const i = arr.indexOf(target);
  if (i < 0) return arr;
  return [...arr.slice(0, i), ...arr.slice(i + 1)];
}

type PlayingState = Extract<GameState, { phase: "playing" }>;
type ProbabilityChoice = Extract<
  import("@/types/web-adventure").Choice,
  { kind: "probability" }
>;

/**
 * The probability check -> creating a pendingRoll (the scene transition is *held*). It stores only the result and keeps currentScene.
 * The user sees the result and decides to reroll or continue (CONFIRM_ROLL). Shared by MAKE_CHOICE and REROLL.
 * The stigma delta applies *on confirmation (CONFIRM_ROLL)*, so only totalDelta is stored here.
 */
function buildPendingRoll(
  state: PlayingState,
  choice: ProbabilityChoice,
  rng?: () => number,
): PlayingState {
  const statValue =
    effectiveStat(state.character, choice.stat) + stigmaDebuff(state.character, choice.stat);
  const result = rollProbability({
    stat: statValue,
    ability: state.character.ability,
    statKey: choice.stat,
    difficulty: choice.difficulty,
    rng,
  });
  const target = result.success ? choice.onSuccess : choice.onFailure;
  const successExtra = result.success ? (choice.stigmaDeltaOnSuccess ?? 0) : 0;
  const failureExtra = !result.success ? (choice.stigmaDeltaOnFailure ?? 0) : 0;
  const totalDelta = (choice.stigmaDelta ?? 0) + successExtra + failureExtra;
  return {
    ...state,
    pendingRoll: {
      choiceId: choice.id,
      label: choice.label,
      roll: result.roll,
      bonus: result.bonus,
      statValue,
      difficulty: choice.difficulty,
      success: result.success,
      target,
      totalDelta,
    },
  };
}

export function gameReducer(state: GameState, action: Action, scenes: SceneRegistry): GameState {
  switch (action.type) {
    case "START_GAME": {
      if (state.phase !== "creating") return state;
      const startScene = scenes[action.startScene];
      if (!startScene) return state;
      // Applying onEnter - a starting scene can have one (week 3 onward).
      const startedCharacter = applyOnEnter(action.character, startScene);
      return {
        phase: "playing",
        character: startedCharacter,
        currentScene: action.startScene,
        // #348 - the starting scene's title and body go into the flow log too.
        log: [
          `▶ ${startScene.title} (${startScene.id})`,
          ...startScene.body.map((b) => `  ${b}`),
        ],
      };
    }

    case "MAKE_CHOICE": {
      if (state.phase !== "playing") return state;
      const scene = scenes[state.currentScene];
      if (!scene) return state;
      const choice = findChoice(scene, action.choiceId);
      if (!choice) return state;

      switch (choice.kind) {
        case "plain":
          return applyChoiceFlags(
            moveTo(state, choice.to, scenes, `선택: ${choice.label}`, choice.stigmaDelta ?? 0),
            choice.setFlags,
          );
        case "probability":
          // It does not transition at once but *waits for the roll* (pendingRoll). The user sees the result and chooses to reroll or continue.
          return buildPendingRoll(state, choice, action.rng);
        case "conditional": {
          if (!evalCondition(choice.condition, state.character)) return state;
          return applyChoiceFlags(
            moveTo(state, choice.to, scenes, `선택: ${choice.label}`, choice.stigmaDelta ?? 0),
            choice.setFlags,
          );
        }
      }
      return state;
    }

    case "USE_ITEM": {
      if (state.phase !== "playing") return state;
      const item = items[action.itemId];
      if (!item) return state;
      if (item.kind !== "consumable") return state;
      if (!state.character.inventory.includes(action.itemId)) return state;
      const heal = item.heal ?? 0;
      const stigmaDelta = item.stigmaDelta ?? 0;
      const nextHp = Math.min(state.character.maxHp, state.character.hp + heal);
      // #258 - applying items.stigmaDelta (refined water -3, a mana stone shard +5 and so on).
      let nextCharacter: Character = {
        ...state.character,
        hp: nextHp,
        inventory: removeFirst(state.character.inventory, action.itemId),
      };
      if (stigmaDelta) nextCharacter = applyStigmaDelta(nextCharacter, stigmaDelta);
      // The log reflects both heal and stigma.
      const logParts: string[] = [];
      if (heal > 0) logParts.push(`+${heal} HP`);
      if (stigmaDelta !== 0) {
        logParts.push(`성흔 침식 ${stigmaDelta > 0 ? "+" : ""}${stigmaDelta}`);
      }
      const logEntry = `사용: ${item.displayName}${logParts.length ? ` (${logParts.join(", ")})` : ""}`;
      const nextLog = [...state.log, logEntry];
      // #258 - contamination reaching 100 gives the automatic petrification ending (ending at once, with no scene move).
      if (isFullyPetrified(nextCharacter)) {
        return {
          phase: "ended",
          character: nextCharacter,
          endingId: "petrification",
          finalSceneId: state.currentScene,
          log: [...nextLog, "성흔 침식이 한계에 도달했다. 몸이 굳어간다…"],
        };
      }
      // #318 - the automatic fall ending at HP 0 (checked alongside the HP cap after USE_ITEM's stigmaDelta +N).
      if (isDead(nextCharacter)) {
        return {
          phase: "ended",
          character: nextCharacter,
          endingId: "fall",
          finalSceneId: state.currentScene,
          log: [...nextLog, "체력이 한계에 도달했다. 더 이상 일어설 수 없다…"],
        };
      }
      return { ...state, character: nextCharacter, log: nextLog };
    }

    case "REROLL": {
      // Rerolls the pending check *in the same scene* (before transitioning, decrementing the count).
      if (state.phase !== "playing" || !state.pendingRoll) return state;
      if (state.character.rerollsLeft <= 0) return state;
      const scene = scenes[state.currentScene];
      if (!scene) return state;
      const choice = findChoice(scene, state.pendingRoll.choiceId);
      if (!choice || choice.kind !== "probability") return state;
      const next = buildPendingRoll(state, choice, action.rng);
      return {
        ...next,
        character: { ...next.character, rerollsLeft: state.character.rerollsLeft - 1 },
      };
    }

    case "CONFIRM_ROLL": {
      // Confirms the pending check - only now does the scene transition and the stigma/hp apply.
      if (state.phase !== "playing" || !state.pendingRoll) return state;
      const pr = state.pendingRoll;
      const logEntry = `${pr.label} — d20=${pr.roll}+${pr.statValue}(+${pr.bonus}) vs ${pr.difficulty} → ${pr.success ? "성공" : "실패"}`;
      // moveTo from a base with pendingRoll removed (the transition plus the delta).
      const base: PlayingState = {
        phase: "playing",
        character: state.character,
        currentScene: state.currentScene,
        log: state.log,
      };
      return moveTo(base, pr.target, scenes, logEntry, pr.totalDelta);
    }

    case "END_GAME": {
      if (state.phase !== "playing") return state;
      return {
        phase: "ended",
        character: state.character,
        endingId: action.endingId,
        finalSceneId: state.currentScene,
        log: [...state.log, `종료 — ${action.endingId}`],
      };
    }

    case "RESET":
      return { phase: "creating" };

    case "RESTORE": {
      // #288 - an old localStorage save (from before #258, before the Eternia refresh)
      //   can be missing protagonist or stigmaErosion. Corrected to safe defaults.
      // #290 - `??` does not block NaN (NaN is not nullish). NaN and Infinity become 0 too.
      const erosion = action.character.stigmaErosion;
      const safeErosion = typeof erosion === "number" && Number.isFinite(erosion) ? erosion : 0;
      const restored: Character = {
        ...action.character,
        protagonist: action.character.protagonist ?? "kael",
        stigmaErosion: safeErosion,
      };
      return {
        phase: "playing",
        character: restored,
        currentScene: action.currentSceneId,
        log: [],
      };
    }

    default:
      return state;
  }
}
