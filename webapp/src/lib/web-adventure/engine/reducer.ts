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
  | { type: "END_GAME"; endingId: string };

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

/** 씬으로 이동 — 결과 씬이 isEnding 이면 ended 로 전환. */
function moveTo(
  prev: Extract<GameState, { phase: "playing" }>,
  targetSceneId: string,
  scenes: SceneRegistry,
  logEntry: string,
): GameState {
  const target = scenes[targetSceneId];
  if (!target) return prev; // 정의 안 된 씬 — 안전하게 무변화.
  const nextLog = [...prev.log, logEntry];
  if (target.isEnding) {
    return {
      phase: "ended",
      character: prev.character,
      endingId: target.endingId ?? "main",
      finalSceneId: target.id,
      log: nextLog,
    };
  }
  return {
    phase: "playing",
    character: prev.character,
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

    default:
      return state;
  }
}
