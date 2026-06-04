"use client";

import { useEffect, useReducer, useState, useCallback } from "react";
import type { GameState, SceneRegistry } from "@/types/web-adventure";
import { gameReducer, type Action } from "@/lib/web-adventure/engine/reducer";
import {
  getScenes,
  START_SCENE_ID,
} from "@/lib/web-adventure/engine/sceneRegistry";
import { items } from "@/content/web-adventure/items";
import CharacterCreator from "./CharacterCreator";
import SceneRenderer from "./SceneRenderer";
import EndingScreen from "./EndingScreen";

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

/** 인벤토리 1 줄 표시 — 3 주차 간단 UI. 본격 사이드 패널은 5 주차. */
function InventoryStrip({
  inventory,
  rerollsLeft,
  hp,
  maxHp,
  onUseItem,
  onReroll,
  canReroll,
}: {
  inventory: string[];
  rerollsLeft: number;
  hp: number;
  maxHp: number;
  onUseItem: (itemId: string) => void;
  onReroll: () => void;
  canReroll: boolean;
}) {
  return (
    <div className="rounded-md bg-amber-100/70 border border-amber-300 p-3 mb-3 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
        <span>
          HP <span className="font-mono font-bold">{hp}</span> / {maxHp}
        </span>
        <span>
          재굴림{" "}
          <span className="font-mono font-bold">{rerollsLeft}</span>
        </span>
        {canReroll && rerollsLeft > 0 && (
          <button
            type="button"
            onClick={onReroll}
            className="rounded bg-amber-700 text-amber-50 px-2 py-0.5 text-xs hover:bg-amber-800"
          >
            직전 판정 다시 굴리기
          </button>
        )}
      </div>
      {inventory.length === 0 ? (
        <div className="mt-1 text-amber-700 italic">가방: 비어 있음</div>
      ) : (
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
          <span className="text-amber-800">가방:</span>
          {inventory.map((id, idx) => {
            const item = items[id];
            if (!item) return <span key={`${id}-${idx}`}>{id}</span>;
            return (
              <span key={`${id}-${idx}`} className="inline-flex items-center gap-1">
                <span>{item.displayName}</span>
                {item.kind === "consumable" && (
                  <button
                    type="button"
                    onClick={() => onUseItem(id)}
                    className="rounded bg-amber-700 text-amber-50 px-1.5 py-0.5 text-xs hover:bg-amber-800"
                    title={item.desc}
                  >
                    사용
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
