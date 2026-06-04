// 게임 상태 머신 — phase 별 전환.
//
// 액션:
//   START_GAME — creating → playing
//   MAKE_CHOICE — playing 에서 현재 씬의 choice 처리 (plain/probability/conditional)
//   END_GAME — playing → ended (강제 종료)
//
// 규칙:
//   - 결과 씬이 isEnding=true 면 자동으로 ended phase 로 전환.
//   - probability 액션은 rng (선택)을 받아 결정적 테스트가 가능하다.
//   - 알 수 없는 액션 / 무효 입력 / 조건 미충족은 *상태 그대로* 반환.

import type {
  Character,
  Choice,
  ChoiceCondition,
  GameState,
  Scene,
  SceneRegistry,
} from "@/types/web-adventure";
import { rollProbability } from "./rollDice";

export type Action =
  | { type: "START_GAME"; character: Character; startScene: string }
  | { type: "MAKE_CHOICE"; choiceId: string; rng?: () => number }
  | { type: "END_GAME"; endingId: string }
  | { type: "RESET" };

function evalCondition(cond: ChoiceCondition, character: Character): boolean {
  switch (cond.kind) {
    case "minStat":
      return character.stats[cond.stat] >= cond.min;
    case "hasItem":
      return character.inventory.includes(cond.itemId);
    case "flag":
      return !!character.flags[cond.key];
  }
}

/** 씬 onEnter 적용 — setFlags / addItems 를 character 에 반영한 새 character 를 반환. */
function applyOnEnter(character: Character, scene: Scene): Character {
  if (!scene.onEnter) return character;
  const { setFlags, addItems } = scene.onEnter;
  const flagsChanged = setFlags && Object.keys(setFlags).length > 0;
  const itemsChanged = addItems && addItems.length > 0;
  if (!flagsChanged && !itemsChanged) return character;
  const nextFlags = flagsChanged ? { ...character.flags, ...setFlags } : character.flags;
  let nextInventory = character.inventory;
  if (itemsChanged) {
    const merged = [...character.inventory];
    for (const it of addItems!) {
      if (!merged.includes(it)) merged.push(it);
    }
    nextInventory = merged;
  }
  return { ...character, flags: nextFlags, inventory: nextInventory };
}

/** 씬으로 이동 — 결과 씬이 isEnding 이면 ended 로 전환. onEnter 적용 후 character 갱신. */
function moveTo(
  prev: Extract<GameState, { phase: "playing" }>,
  targetSceneId: string,
  scenes: SceneRegistry,
  logEntry: string,
): GameState {
  const target = scenes[targetSceneId];
  if (!target) return prev; // 정의 안 된 씬 — 안전하게 무변화.
  const nextLog = [...prev.log, logEntry];
  const nextCharacter = applyOnEnter(prev.character, target);
  if (target.isEnding) {
    return {
      phase: "ended",
      character: nextCharacter,
      endingId: target.endingId ?? "main",
      finalSceneId: target.id,
      log: nextLog,
    };
  }
  return {
    phase: "playing",
    character: nextCharacter,
    currentScene: target.id,
    log: nextLog,
  };
}

function findChoice(scene: Scene, choiceId: string): Choice | undefined {
  return scene.choices.find((c) => c.id === choiceId);
}

export function gameReducer(state: GameState, action: Action, scenes: SceneRegistry): GameState {
  switch (action.type) {
    case "START_GAME": {
      if (state.phase !== "creating") return state;
      const startScene = scenes[action.startScene];
      if (!startScene) return state;
      return {
        phase: "playing",
        character: action.character,
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
          return moveTo(state, choice.to, scenes, `선택: ${choice.label}`);
        case "probability": {
          const result = rollProbability({
            stat: state.character.stats[choice.stat],
            ability: state.character.ability,
            statKey: choice.stat,
            difficulty: choice.difficulty,
            rng: action.rng,
          });
          const target = result.success ? choice.onSuccess : choice.onFailure;
          const logEntry = `${choice.label} — d20=${result.roll}+${state.character.stats[choice.stat]}(+${result.bonus}) vs ${choice.difficulty} → ${result.success ? "성공" : "실패"}`;
          return moveTo(state, target, scenes, logEntry);
        }
        case "conditional": {
          if (!evalCondition(choice.condition, state.character)) return state;
          return moveTo(state, choice.to, scenes, `선택: ${choice.label}`);
        }
      }
      return state;
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

    default:
      return state;
  }
}
