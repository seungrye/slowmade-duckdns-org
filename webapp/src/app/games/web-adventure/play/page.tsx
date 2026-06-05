"use client";

import { useEffect, useReducer, useRef, useState, useCallback } from "react";
import type { GameState, SceneRegistry } from "@/types/web-adventure";
import { gameReducer, type Action } from "@/lib/web-adventure/engine/reducer";
import {
  getScenes,
  START_SCENE_ID,
} from "@/lib/web-adventure/engine/sceneRegistry";
import { useAutoSave } from "@/lib/web-adventure/use-auto-save";
import { useMigrateOnLogin } from "@/lib/web-adventure/use-migrate-on-login";
import Link from "next/link";
import CharacterCreator from "./CharacterCreator";
import SceneRenderer from "./SceneRenderer";
import EndingScreen from "./EndingScreen";
import StatusPanel from "./StatusPanel";
import MobileDrawer from "./MobileDrawer";

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

  // #240 — 로그인 직후 localStorage 의 save/past_runs → 서버 이전 (한 번만).
  useMigrateOnLogin();

  // #238 — 자동 저장 + 마운트 시 복원.
  // #239 — 회차 시스템: ended 진입 시 end-run API 호출 + runIndex +1.
  const [runIndex, setRunIndex] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const endRunSentRef = useRef<string | null>(null);

  useAutoSave(state, {
    runIndex,
    onRestore: (payload) => {
      if (scenes[payload.currentSceneId]) {
        setRunIndex(payload.runIndex);
        dispatch({
          type: "RESTORE",
          character: payload.character,
          currentSceneId: payload.currentSceneId,
        });
      }
    },
  });

  // #239 — ended 진입 시 한 번만 end-run POST → save 의 runIndex+1 + past_run 적치.
  //   서버 401(비로그인) 은 silent skip. 같은 runIndex 중복 전송 방지.
  useEffect(() => {
    if (state.phase !== "ended") return;
    const sentKey = `${runIndex}:${state.endingId}`;
    if (endRunSentRef.current === sentKey) return;
    endRunSentRef.current = sentKey;
    void fetch("/api/web-adventure/end-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endingId: state.endingId,
        finalSceneId: state.finalSceneId,
      }),
    })
      .then((res) => {
        if (res.ok) setRunIndex((n) => n + 1);
      })
      .catch(() => {
        /* 네트워크/auth 실패 silent — 다음 게임 시작 시 save 갱신으로 회복 */
      });
  }, [state, runIndex]);

  return (
    <main className="min-h-screen bg-amber-50 text-amber-950 py-6 px-4">
      <div className="max-w-5xl mx-auto">
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
            {/* 모바일 햄버거 — fixed 우상단. 데스크탑은 사이드 패널이 보이므로 숨김. */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="md:hidden fixed top-3 right-3 z-30 rounded bg-amber-700 text-amber-50 px-3 py-1.5 text-sm shadow"
              aria-label="상태 메뉴 열기"
            >
              ☰ 상태
            </button>

            <div className="md:grid md:grid-cols-[1fr_280px] md:gap-4">
              <div>
                <SceneRenderer
                  scene={scenes[state.currentScene]}
                  character={state.character}
                  onChoose={(choiceId) => dispatch({ type: "MAKE_CHOICE", choiceId })}
                />
              </div>
              {/* 데스크탑 사이드 패널 */}
              <div className="hidden md:block">
                <StatusPanel
                  character={state.character}
                  runIndex={runIndex}
                  onUseItem={(itemId) => dispatch({ type: "USE_ITEM", itemId })}
                  onReroll={() => dispatch({ type: "REROLL" })}
                  canReroll={Boolean((state as PlayingMeta).lastProbability)}
                />
              </div>
            </div>

            {/* 모바일 drawer — 같은 StatusPanel + 갤러리 링크 */}
            <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
              <StatusPanel
                character={state.character}
                runIndex={runIndex}
                onUseItem={(itemId) => dispatch({ type: "USE_ITEM", itemId })}
                onReroll={() => dispatch({ type: "REROLL" })}
                canReroll={Boolean((state as PlayingMeta).lastProbability)}
              />
              <div className="mt-3 pt-2 border-t border-amber-300">
                <Link
                  href="/games/web-adventure/gallery"
                  className="block text-center rounded bg-amber-700 text-amber-50 px-3 py-2 text-sm hover:bg-amber-800"
                >
                  🏆 엔딩 갤러리
                </Link>
              </div>
            </MobileDrawer>
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
