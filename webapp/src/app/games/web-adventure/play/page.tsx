"use client";

import { useReducer } from "react";
import type { GameState } from "@/types/web-adventure";
import { gameReducer, type Action } from "@/lib/web-adventure/engine/reducer";
import { scenes, START_SCENE_ID } from "@/lib/web-adventure/engine/sceneRegistry";
import CharacterCreator from "./CharacterCreator";
import SceneRenderer from "./SceneRenderer";

// CSR 플레이 화면 — reducer 기반 상태 머신.
//
// phase 별 렌더:
//   creating → CharacterCreator
//   playing  → SceneRenderer (현재 씬)
//   ended    → 엔딩 화면 + 다시 시작

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
          <p className="text-xs text-amber-700 mt-1">1 주차 PoC</p>
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
          <section className="rounded-lg bg-amber-100/70 border border-amber-300 p-6 shadow-sm text-center">
            <h2 className="text-2xl font-bold mb-3">엔딩 — {state.endingId}</h2>
            <p className="mb-4 text-amber-900">
              모험이 끝났습니다. (1 주차 PoC — 더 많은 컨텐츠는 곧 추가됩니다.)
            </p>

            <details className="text-left mb-4 text-sm text-amber-800">
              <summary className="cursor-pointer">선택 로그</summary>
              <ul className="mt-2 space-y-1 pl-4 list-disc">
                {state.log.map((entry, i) => (
                  <li key={i}>{entry}</li>
                ))}
              </ul>
            </details>

            <a
              href="/games/web-adventure/play"
              className="inline-block rounded-md bg-amber-700 text-amber-50 px-5 py-2 font-semibold hover:bg-amber-800 transition-colors"
            >
              다시 시작
            </a>
          </section>
        )}
      </div>
    </main>
  );
}
