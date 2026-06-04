"use client";

import { useReducer } from "react";
import type { GameState } from "@/types/web-adventure";
import { gameReducer, type Action } from "@/lib/web-adventure/engine/reducer";
import { scenes, START_SCENE_ID } from "@/lib/web-adventure/engine/sceneRegistry";
import CharacterCreator from "./CharacterCreator";
import SceneRenderer from "./SceneRenderer";
import EndingScreen from "./EndingScreen";

// CSR 플레이 화면 — reducer 기반 상태 머신.
//
// phase 별 렌더:
//   creating → CharacterCreator
//   playing  → SceneRenderer (현재 씬)
//   ended    → EndingScreen (메타 + 최종 스탯 + 다시 시작)

const initialState: GameState = { phase: "creating" };

function reducer(state: GameState, action: Action): GameState {
  return gameReducer(state, action, scenes);
}

export default function WebAdventurePlayPage() {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <main className="min-h-screen bg-amber-50 text-amber-950 py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <header className="mb-4 text-center">
          <h1 className="text-2xl md:text-3xl font-bold">Web Adventure</h1>
          <p className="text-xs text-amber-700 mt-1">2 주차 데모 — 5 씬 + 2 분기 + 2 엔딩</p>
        </header>

        {state.phase === "creating" && (
          <CharacterCreator
            onComplete={(character) =>
              dispatch({ type: "START_GAME", character, startScene: START_SCENE_ID })
            }
          />
        )}

        {state.phase === "playing" && scenes[state.currentScene] && (
          <SceneRenderer
            scene={scenes[state.currentScene]}
            character={state.character}
            onChoose={(choiceId) => dispatch({ type: "MAKE_CHOICE", choiceId })}
          />
        )}

        {state.phase === "ended" && (
          <EndingScreen
            endingId={state.endingId}
            character={state.character}
            log={state.log}
            onRestart={() => dispatch({ type: "RESET" })}
          />
        )}
      </div>
    </main>
  );
}
