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
    // #321 — 4 성흔 (lunar/selene/hecate/none) 별 특수 분기.
    case "ability":
      return character.ability === cond.required;
    // #359 각성 — 침식도 임계.
    case "stigmaAtLeast":
      return character.stigmaErosion >= cond.min;
    // #359 각성 — 복합 AND (모든 하위 조건 충족).
    case "all":
      return cond.conditions.every((c) => evalCondition(c, character));
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
  const { setFlags, addItems, incrementCounters, stigmaDelta, hpDelta, rerollDelta, setVars } = scene.onEnter as {
    setFlags?: Record<string, boolean>;
    addItems?: string[];
    incrementCounters?: string[];
    stigmaDelta?: number;
    hpDelta?: number; // #318 — HP 변화 (음수=데미지, 양수=회복).
    rerollDelta?: number; // 재굴림 횟수 변화 (양수=보충).
    setVars?: Record<string, string | number>; // 동적 텍스트 변수({{키}} 치환 소스).
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
  // #318 — HP 적용 (clamp [0, maxHp]).
  if (hpChanged) {
    const safeHp = Math.max(0, Math.min(next.maxHp, next.hp + hpDelta));
    next = { ...next, hp: safeHp };
  }
  // 재굴림 보충 (음수 방지).
  if (rerollChanged) {
    next = { ...next, rerollsLeft: Math.max(0, next.rerollsLeft + rerollDelta) };
  }
  // 동적 텍스트 변수 병합({{키}} 치환 소스).
  if (varsChanged) {
    next = { ...next, variables: { ...(next.variables ?? {}), ...setVars } };
  }
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
  // #348 — 흐름 로그: 선택 라벨 + 다음 씬 의 제목/본문 push.
  //   EndingScreen 의 *선택 로그* 가 풍부해져 시나리오 연결 검토 가능.
  const nextLog = [
    ...prev.log,
    `→ ${logEntry}`,
    `▶ ${target.title} (${target.id})`,
    ...target.body.map((b) => `  ${b}`),
  ];
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
  // #318 — HP 0 자동 fall ending. RNG 실패가 즉시 시나리오 ending 아닌 *누적 데미지* 로.
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

/** 인벤에서 *최초 1 개* 만 제거. */
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
 * probability 판정 → pendingRoll 생성 (씬 전이 *보류*). 결과만 보관하고 currentScene 유지.
 * 사용자가 결과를 보고 재굴림/계속(CONFIRM_ROLL)을 정한다. MAKE_CHOICE/REROLL 공유.
 * stigma delta 는 *확정(CONFIRM_ROLL) 시* 적용되므로 여기선 totalDelta 만 보관.
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
      // onEnter 적용 — 시작 씬에 onEnter 가 있을 수 있음 (3 주차+).
      const startedCharacter = applyOnEnter(action.character, startScene);
      return {
        phase: "playing",
        character: startedCharacter,
        currentScene: action.startScene,
        // #348 — 시작 씬 의 제목 + 본문 도 흐름 로그 에 포함.
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
          return moveTo(state, choice.to, scenes, `선택: ${choice.label}`, choice.stigmaDelta ?? 0);
        case "probability":
          // 즉시 전이하지 않고 *판정 대기*(pendingRoll). 결과를 보고 재굴림/계속 선택.
          return buildPendingRoll(state, choice, action.rng);
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
      const stigmaDelta = item.stigmaDelta ?? 0;
      const nextHp = Math.min(state.character.maxHp, state.character.hp + heal);
      // #258 — items.stigmaDelta 적용 (정제수 -3, 마력석 파편 +5 등).
      let nextCharacter: Character = {
        ...state.character,
        hp: nextHp,
        inventory: removeFirst(state.character.inventory, action.itemId),
      };
      if (stigmaDelta) nextCharacter = applyStigmaDelta(nextCharacter, stigmaDelta);
      // 로그: heal / stigma 둘 다 반영.
      const logParts: string[] = [];
      if (heal > 0) logParts.push(`+${heal} HP`);
      if (stigmaDelta !== 0) {
        logParts.push(`성흔 침식 ${stigmaDelta > 0 ? "+" : ""}${stigmaDelta}`);
      }
      const logEntry = `사용: ${item.displayName}${logParts.length ? ` (${logParts.join(", ")})` : ""}`;
      const nextLog = [...state.log, logEntry];
      // #258 — 침식 100 도달 시 자동 petrification 엔딩 (씬 이동 없이 즉시 종결).
      if (isFullyPetrified(nextCharacter)) {
        return {
          phase: "ended",
          character: nextCharacter,
          endingId: "petrification",
          finalSceneId: state.currentScene,
          log: [...nextLog, "성흔 침식이 한계에 도달했다. 몸이 굳어간다…"],
        };
      }
      // #318 — HP 0 자동 fall ending (USE_ITEM 의 stigmaDelta +N 후 HP cap 같이 검사).
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
      // 대기 중(pendingRoll) 판정을 *같은 씬*에서 다시 굴린다 (전이 전, 횟수 -1).
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
      // 대기 중 판정을 확정 — 비로소 씬 전이 + stigma/hp 적용.
      if (state.phase !== "playing" || !state.pendingRoll) return state;
      const pr = state.pendingRoll;
      const logEntry = `${pr.label} — d20=${pr.roll}+${pr.statValue}(+${pr.bonus}) vs ${pr.difficulty} → ${pr.success ? "성공" : "실패"}`;
      // pendingRoll 제거한 base 에서 moveTo (전이 + delta).
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
      // #288 — 옛 localStorage save (#258 이전, 〈에테르니아〉 리프래시 이전)
      //   에 protagonist / stigmaErosion 누락 가능. 안전 기본값 보정.
      // #290 — `??` 가 NaN 차단 못 함 (NaN 은 nullish 아님). NaN/Infinity 도 0 으로.
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
