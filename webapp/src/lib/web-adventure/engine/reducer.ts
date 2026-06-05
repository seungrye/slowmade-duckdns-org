// 게임 상태 머신 — phase 별 전환.
//
// 액션:
//   START_GAME — creating → playing
//   MAKE_CHOICE — playing 에서 현재 씬의 choice 처리 (plain/probability/conditional)
//   USE_ITEM — 인벤 consumable 사용 (HP 회복 + 소모) — 3 주차
//   REROLL — 직전 probability 판정 재굴림 (rerollsLeft 소모) — 3 주차
//   END_GAME — playing → ended (강제 종료)
//   RESET — creating 으로 복귀
//
// 규칙:
//   - 결과 씬이 isEnding=true 면 자동으로 ended phase 로 전환.
//   - probability 판정은 *effectiveStat* (패시브 포함) 으로 계산.
//   - 인벤 cap 8 — addItems 초과분 무시.
//   - rng 인자는 결정적 테스트 주입용.

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
import { applyStigmaDelta, isFullyPetrified, stigmaDebuff } from "./stigma";
import { items, INVENTORY_CAP } from "@/content/web-adventure/items";

export type Action =
  | { type: "START_GAME"; character: Character; startScene: string }
  | { type: "MAKE_CHOICE"; choiceId: string; rng?: () => number }
  | { type: "USE_ITEM"; itemId: string }
  | { type: "REROLL"; rng?: () => number }
  | { type: "END_GAME"; endingId: string }
  | { type: "RESET" }
  // #238 — 저장에서 불러올 때. character + currentSceneId 로 playing 즉시 진입.
  | { type: "RESTORE"; character: Character; currentSceneId: string };

function evalCondition(cond: ChoiceCondition, character: Character): boolean {
  switch (cond.kind) {
    case "minStat":
      return effectiveStat(character, cond.stat) + stigmaDebuff(character, cond.stat) >= cond.min;
    case "hasItem":
      return character.inventory.includes(cond.itemId);
    case "flag": {
      // 5 주차 (#221) — expect 로 반전 매치. 미정의 시 기본값 true (기존 동작 보존).
      const expected = cond.expect ?? true;
      const actual = character.flags[cond.key] === true;
      return actual === expected;
    }
    case "minFlag": {
      const v = character.flags[cond.key];
      const num = typeof v === "number" ? v : v === true ? 1 : 0;
      return num >= cond.min;
    }
  }
}

/**
 * onEnter.addItems 병합 규칙 (#203).
 * - 인벤이 cap 에 도달하면 즉시 중단.
 * - 카탈로그 미정의 id 는 skip.
 * - stackable=false 이고 이미 보유 중이면 skip (재진입 중복 방지).
 * - stackable=true 면 그대로 push (개수 누적).
 */
function pushItems(inventory: string[], toAdd: string[]): string[] {
  const result = [...inventory];
  for (const id of toAdd) {
    if (result.length >= INVENTORY_CAP) break; // cap — 초과분 무시.
    const item = items[id];
    if (!item) continue; // 미정의 id 는 무시.
    if (!item.stackable && result.includes(id)) continue; // 비-스택 중복 차단.
    result.push(id);
  }
  return result;
}

/** 씬 onEnter 적용 — setFlags / addItems / incrementCounters / stigmaDelta 를 character 에 반영. */
function applyOnEnter(character: Character, scene: Scene): Character {
  if (!scene.onEnter) return character;
  const { setFlags, addItems, incrementCounters, stigmaDelta } = scene.onEnter;
  const flagsChanged = setFlags && Object.keys(setFlags).length > 0;
  const itemsChanged = addItems && addItems.length > 0;
  const countersChanged = incrementCounters && incrementCounters.length > 0;
  const stigmaChanged = typeof stigmaDelta === "number" && stigmaDelta !== 0;
  if (!flagsChanged && !itemsChanged && !countersChanged && !stigmaChanged) return character;
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
  return next;
}

/** 씬으로 이동 — 결과 씬이 isEnding 이면 ended 로 전환. onEnter 적용 후 character 갱신.
 *
 * #250 — 추가로 *선행 stigmaDelta* (choice 의 stigmaDelta + 성공/실패 별 추가) 도
 *   onEnter 적용 *전* 에 누적. 그 결과 침식도 100 도달 → 자동 petrification 엔딩
 *   (target.isEnding 이 아니어도 우선).
 */
function moveTo(
  prev: Extract<GameState, { phase: "playing" }>,
  targetSceneId: string,
  scenes: SceneRegistry,
  logEntry: string,
  preStigmaDelta = 0,
): GameState {
  const target = scenes[targetSceneId];
  if (!target) return prev; // 정의 안 된 씬 — 안전하게 무변화.
  const nextLog = [...prev.log, logEntry];
  let character = prev.character;
  if (preStigmaDelta) character = applyStigmaDelta(character, preStigmaDelta);
  character = applyOnEnter(character, target);
  // #250 — 자동 petrification (명시 isEnding 보다 *후순위* — target.isEnding 이 우선).
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

/** 인벤에서 *최초 1 개* 만 제거. */
function removeFirst(arr: string[], target: string): string[] {
  const i = arr.indexOf(target);
  if (i < 0) return arr;
  return [...arr.slice(0, i), ...arr.slice(i + 1)];
}

/**
 * 마지막 probability 결정 — REROLL 이 *직전 판정 씬* 으로 되돌아가 다시 굴리기 위한 메타.
 * 단순 설계: state.log 마지막 entry 가 probability 판정이면 그 직전 씬 + choiceId 를 알 수 없으니,
 * playing 상태에 *pendingReroll* 메타를 두는 대신, **방금 도달한 씬의 *역참조*** 로 처리.
 *
 * 더 단순: REROLL 은 *현재 씬* 으로 들어오기 *직전의 probability choice* 를 다시 굴린다.
 * 이를 위해 playing 상태에 lastProbability 메타를 둔다.
 */
type PlayingState = Extract<GameState, { phase: "playing" }>;
type LastProbability = {
  prevSceneId: string;
  choiceId: string;
  stat: import("@/types/web-adventure").StatKey;
  difficulty: number;
  onSuccess: string;
  onFailure: string;
};

// playing state 에 lastProbability 메타 부착 (옵셔널).
// GameState 타입을 깨지 않고 런타임 필드만 추가 — Object spread 사용.
type PlayingWithMeta = PlayingState & { lastProbability?: LastProbability };

export function gameReducer(state: GameState, action: Action, scenes: SceneRegistry): GameState {
  switch (action.type) {
    case "START_GAME": {
      if (state.phase !== "creating") return state;
      const startScene = scenes[action.startScene];
      if (!startScene) return state;
      // onEnter 적용 — 시작 씬에 onEnter 가 있을 수 있음 (3 주차+).
      const startedCharacter = applyOnEnter(action.character, startScene);
      return {
        phase: "playing",
        character: startedCharacter,
        currentScene: action.startScene,
        log: [`게임 시작 — ${startScene.title}`],
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
          return moveTo(state, choice.to, scenes, `선택: ${choice.label}`, choice.stigmaDelta ?? 0);
        case "probability": {
          // #250 — 침식 디버프 (con/dex -2 if stigma>=50) 가 effective stat 에 적용.
          const statValue = effectiveStat(state.character, choice.stat) + stigmaDebuff(state.character, choice.stat);
          const result = rollProbability({
            stat: statValue,
            ability: state.character.ability,
            statKey: choice.stat,
            difficulty: choice.difficulty,
            rng: action.rng,
          });
          const target = result.success ? choice.onSuccess : choice.onFailure;
          const logEntry = `${choice.label} — d20=${result.roll}+${statValue}(+${result.bonus}) vs ${choice.difficulty} → ${result.success ? "성공" : "실패"}`;
          // #250 — choice 의 stigmaDelta + 성공/실패 별 추가 delta.
          const successExtra = result.success ? (choice.stigmaDeltaOnSuccess ?? 0) : 0;
          const failureExtra = !result.success ? (choice.stigmaDeltaOnFailure ?? 0) : 0;
          const totalDelta = (choice.stigmaDelta ?? 0) + successExtra + failureExtra;
          const next = moveTo(state, target, scenes, logEntry, totalDelta);
          // probability 판정 결과를 *PlayingState* 라면 메타로 기록 (REROLL 용).
          if (next.phase === "playing") {
            const withMeta: PlayingWithMeta = {
              ...next,
              lastProbability: {
                prevSceneId: state.currentScene,
                choiceId: choice.id,
                stat: choice.stat,
                difficulty: choice.difficulty,
                onSuccess: choice.onSuccess,
                onFailure: choice.onFailure,
              },
            };
            return withMeta;
          }
          return next;
        }
        case "conditional": {
          if (!evalCondition(choice.condition, state.character)) return state;
          return moveTo(state, choice.to, scenes, `선택: ${choice.label}`, choice.stigmaDelta ?? 0);
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
      const nextHp = Math.min(state.character.maxHp, state.character.hp + heal);
      return {
        ...state,
        character: {
          ...state.character,
          hp: nextHp,
          inventory: removeFirst(state.character.inventory, action.itemId),
        },
        log: [...state.log, `사용: ${item.displayName} (+${heal} HP)`],
      };
    }

    case "REROLL": {
      if (state.phase !== "playing") return state;
      const meta = (state as PlayingWithMeta).lastProbability;
      if (!meta) return state;
      if (state.character.rerollsLeft <= 0) return state;
      // 이전 씬 으로 *복원* — 단, 실제 씬 전환은 필요 없음. 대신 *재굴림 결과로 다시 moveTo*.
      const statValue = effectiveStat(state.character, meta.stat);
      const result = rollProbability({
        stat: statValue,
        ability: state.character.ability,
        statKey: meta.stat,
        difficulty: meta.difficulty,
        rng: action.rng,
      });
      const target = result.success ? meta.onSuccess : meta.onFailure;
      // 재굴림은 prevSceneId 기준 으로 시뮬레이션 — log 에 재굴림 표시.
      const logEntry = `재굴림 — d20=${result.roll}+${statValue}(+${result.bonus}) vs ${meta.difficulty} → ${result.success ? "성공" : "실패"}`;
      // rerollsLeft -1 + 이전 씬 *복원* 한 state 를 base 로 다시 moveTo.
      const reverted: PlayingState = {
        ...state,
        character: { ...state.character, rerollsLeft: state.character.rerollsLeft - 1 },
        currentScene: meta.prevSceneId,
      };
      // moveTo 가 onEnter 를 *다시* 적용하므로, *이전 씬으로 복귀했다가* 다시 *재굴림 결과 씬* 으로 이동.
      // 단, 직전 실패 씬의 onEnter 가 flag 를 부여한 경우 중복 적용 방지를 위해 log 만 append 후 moveTo.
      const moved = moveTo(reverted, target, scenes, logEntry);
      if (moved.phase === "playing") {
        const withMeta: PlayingWithMeta = {
          ...moved,
          lastProbability: meta,
        };
        return withMeta;
      }
      return moved;
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

    case "RESTORE":
      return {
        phase: "playing",
        character: action.character,
        currentScene: action.currentSceneId,
        log: [],
      };

    default:
      return state;
  }
}
