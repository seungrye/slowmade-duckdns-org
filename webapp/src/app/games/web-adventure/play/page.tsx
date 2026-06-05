"use client";

import { useEffect, useReducer, useState, useCallback } from "react";
import type { GameState, SceneRegistry } from "@/types/web-adventure";
import { gameReducer, type Action } from "@/lib/web-adventure/engine/reducer";
import {
  getScenes,
  START_SCENE_ID,
} from "@/lib/web-adventure/engine/sceneRegistry";
import CharacterCreator from "./CharacterCreator";
import SceneRenderer from "./SceneRenderer";
import EndingScreen from "./EndingScreen";
import InventoryStrip from "./InventoryStrip";

// CSR 플레이 화면 — reducer 기반 상태 머신.
//
// Phase D 변경: 정적 import 된 scenes 대신 `/api/web-adventure/content/v1` 에서
// mongo 컨텐츠를 fetch 한 뒤 reducer 에 주입한다. 로딩 중 / fetch 실패 / 정상
// 3 가지 UI 상태를 가진다.
//
// phase 별 렌더:
//   creating → CharacterCreator
//   playing  → 상단 상태(HP/인벤/재굴림) + SceneRenderer
//   ended    → EndingScreen

const initialState: GameState = { phase: "creating" };

type PlayingMeta = GameState & { lastProbability?: unknown };

export default function WebAdventurePlayPage() {
  const [scenes, setScenes] = useState<SceneRegistry | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadScenes = useCallback(() => {
    setError(null);
    setScenes(null);
    getScenes({ force: true })
      .then((data) => setScenes(data))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getScenes()
      .then((data) => {
        if (!cancelled) setScenes(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main className="min-h-screen bg-amber-50 text-amber-950 py-6 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-red-700 mb-3">오류: {error}</p>
          <button
            type="button"
            onClick={loadScenes}
            className="rounded bg-amber-700 text-amber-50 px-3 py-1 text-sm hover:bg-amber-800"
          >
            재시도
          </button>
        </div>
      </main>
    );
  }

  if (!scenes) {
    return (
      <main className="min-h-screen bg-amber-50 text-amber-950 py-6 px-4">
        <div className="max-w-2xl mx-auto text-center text-amber-800">
          씬 데이터 로딩…
        </div>
      </main>
    );
  }

  return <PlayInner scenes={scenes} />;
}

function PlayInner({ scenes }: { scenes: SceneRegistry }) {
  const [state, dispatch] = useReducer(
    (s: GameState, action: Action) => gameReducer(s, action, scenes),
    initialState,
  );

  return (
    <main className="min-h-screen bg-amber-50 text-amber-950 py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <header className="mb-4 text-center">
          <h1 className="text-2xl md:text-3xl font-bold">Web Adventure</h1>
          <p className="text-xs text-amber-700 mt-1">
            3 주차 데모 — 15 씬 + 인벤토리 + USE_ITEM + 재굴림
          </p>
        </header>

        {state.phase === "creating" && (
          <CharacterCreator
            onComplete={(character) =>
              dispatch({ type: "START_GAME", character, startScene: START_SCENE_ID })
            }
          />
        )}

        {state.phase === "playing" && scenes[state.currentScene] && (
          <>
            <InventoryStrip
              inventory={state.character.inventory}
              rerollsLeft={state.character.rerollsLeft}
              hp={state.character.hp}
              maxHp={state.character.maxHp}
              onUseItem={(itemId) => dispatch({ type: "USE_ITEM", itemId })}
              onReroll={() => dispatch({ type: "REROLL" })}
              canReroll={Boolean((state as PlayingMeta).lastProbability)}
            />
            <SceneRenderer
              scene={scenes[state.currentScene]}
              character={state.character}
              onChoose={(choiceId) => dispatch({ type: "MAKE_CHOICE", choiceId })}
            />
          </>
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
