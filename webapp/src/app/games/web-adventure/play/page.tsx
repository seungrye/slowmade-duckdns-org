"use client";

import { useEffect, useReducer, useRef, useState, useCallback } from "react";
import type { GameState, SceneRegistry } from "@/types/web-adventure";
import { gameReducer, type Action } from "@/lib/web-adventure/engine/reducer";
import { getScenes } from "@/lib/web-adventure/engine/sceneRegistry";
import { useAutoSave, LOCAL_STORAGE_KEY as LOCAL_STORAGE_SAVE_KEY } from "@/lib/web-adventure/use-auto-save";
import {
  useMigrateOnLogin,
  LOCAL_STORAGE_PAST_RUNS_KEY,
} from "@/lib/web-adventure/use-migrate-on-login";
import { logAdvEvent } from "@/lib/web-adventure/analytics";
import { buildWorldFlags } from "@/lib/web-adventure/world-flags";
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
      <main className="min-h-screen bg-amber-50 text-amber-950 py-6 px-4 web-adventure-page">
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
      <main className="min-h-screen bg-amber-50 text-amber-950 py-6 px-4 web-adventure-page">
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
  // #256 — world flag 부메랑: 이전 회차 endingId → world.* flags 주입.
  const [runIndex, setRunIndex] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [worldFlags, setWorldFlags] = useState<Record<string, boolean>>({});
  const endRunSentRef = useRef<string | null>(null);
  // #273 — 침식 80 첫 도달 트래킹 (회차당 1 회). useRef 로 sentinel.
  const stigmaCriticalSentRef = useRef<number | null>(null);
  // 거쳐간 씬 시퀀스 추적 (경로 분포 통계용) — end-run 시 서버로 전송.
  const scenePathRef = useRef<string[]>([]);

  // #256 — 마운트 시 past_runs fetch → worldFlags 계산.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/web-adventure/past-runs");
        if (!cancelled && res.ok) {
          const json = (await res.json()) as { data?: Array<{ endingId?: string }> };
          if (Array.isArray(json?.data)) {
            setWorldFlags(buildWorldFlags(json.data));
            return;
          }
        }
      } catch {
        /* fallback to localStorage */
      }
      if (cancelled) return;
      try {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_PAST_RUNS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Array<{ endingId?: string }>;
          if (Array.isArray(parsed)) setWorldFlags(buildWorldFlags(parsed));
        }
      } catch {
        /* 무시 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // #273 — 침식이 80 (critical) 처음 도달한 회차에 한 번만 발화.
  useEffect(() => {
    if (state.phase !== "playing") return;
    if (state.character.stigmaErosion < 80) return;
    if (stigmaCriticalSentRef.current === runIndex) return;
    stigmaCriticalSentRef.current = runIndex;
    logAdvEvent("stigma_critical", {
      stigma_erosion: state.character.stigmaErosion,
      protagonist: state.character.protagonist,
      run_index: runIndex,
    });
  }, [state, runIndex]);

  // 경로 추적 — playing 중 currentScene 이 바뀌면 시퀀스에 append.
  //   creating(회차 시작 전)으로 돌아오면 초기화. RESTORE(이어하기)는 중간부터라
  //   경로가 불완전할 수 있으나 대부분 새 모험이라 허용.
  useEffect(() => {
    if (state.phase === "playing") {
      const path = scenePathRef.current;
      if (path[path.length - 1] !== state.currentScene) {
        path.push(state.currentScene);
      }
    } else if (state.phase === "creating") {
      scenePathRef.current = [];
    }
  }, [state]);

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
  // #245 — adv_ending_reached 도 같이 발화.
  // #250 — 서버 응답과 무관하게 localStorage 에 *동기 append* (이슈 #250).
  //   비로그인이면 갤러리 fallback 만 의지. 로그인이면 race 보호 (end-run insert
  //   가 끝나기 전 갤러리 진입해도 localStorage 의 최신 도달분이 보임). dedup
  //   runIndex 기준.
  useEffect(() => {
    if (state.phase !== "ended") return;
    const sentKey = `${runIndex}:${state.endingId}`;
    if (endRunSentRef.current === sentKey) return;
    endRunSentRef.current = sentKey;

    // localStorage 의 past-runs 에 append (dedup by runIndex).
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_PAST_RUNS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        const list = Array.isArray(arr) ? arr : [];
        const filtered = list.filter(
          (r: { runIndex?: number }) => r?.runIndex !== runIndex,
        );
        filtered.push({
          endingId: state.endingId,
          runIndex,
          finalSceneId: state.finalSceneId,
          // #289 — character snapshot 제거. EndingGallery/buildWorldFlags 모두
          //   endingId 만 사용. character 포함 시 1 회차 ~260B 누적 → 만 회차에
          //   quota 5MB 절반 차지 → 운영 시 silent skip.
          //   진짜 snapshot 은 *서버 past-runs* 에만 보관.
          completedAt: new Date().toISOString(),
        });
        // 최근 200 회차만 유지 — buildWorldFlags 는 *unique endingId* 만 필요.
        const trimmed = filtered.slice(-200);
        window.localStorage.setItem(
          LOCAL_STORAGE_PAST_RUNS_KEY,
          JSON.stringify(trimmed),
        );
      } catch {
        /* quota/private 모드 — 무시 */
      }

      // #251 — localStorage save 의 진행 데이터 clear (= 회차 종결).
      //   서버 end-run 의 character/currentSceneId unset 과 대칭.
      //   다음 마운트 시 useAutoSave 의 onRestore 가 currentSceneId 없으면
      //   RESTORE skip → creating phase (= '새 모험').
      try {
        const rawSave = window.localStorage.getItem(LOCAL_STORAGE_SAVE_KEY);
        if (rawSave) {
          const save = JSON.parse(rawSave);
          delete save.character;
          delete save.currentSceneId;
          save.runIndex = (save.runIndex ?? runIndex) + 1;
          window.localStorage.setItem(LOCAL_STORAGE_SAVE_KEY, JSON.stringify(save));
        }
      } catch {
        /* parse/quota — 무시 */
      }
    }

    logAdvEvent("ending_reached", {
      ending_id: state.endingId,
      run_index: runIndex,
      protagonist: state.character.protagonist,
      stigma_erosion: state.character.stigmaErosion,
    });
    // #273 — 자동 petrification (stigma ≥ 100 자동 전환) 별도 트래킹.
    //   현재 콘텐츠에 petrification 으로의 *분기* 가 없어 *항상* 자동.
    if (state.endingId === "petrification") {
      logAdvEvent("petrification_auto", {
        protagonist: state.character.protagonist,
        run_index: runIndex,
      });
    }
    void fetch("/api/web-adventure/end-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endingId: state.endingId,
        finalSceneId: state.finalSceneId,
        scenePath: scenePathRef.current,
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
    <main className="min-h-screen bg-amber-50 text-amber-950 py-6 px-4 web-adventure-page">
      <div className="max-w-5xl mx-auto">
        <header className="mb-4 text-center">
          <h1 className="text-2xl md:text-3xl font-bold">에테르니아의 추락</h1>
          <p className="text-xs text-amber-700 mt-1">
            천체 마법공학 다크 에픽 · 3 주인공 · 6 엔딩 · 세 달이 정렬한다
          </p>
        </header>

        {state.phase === "creating" && (
          <CharacterCreator
            onComplete={(character, startScene) => {
              // #245 — adv_run_started.
              logAdvEvent("run_started", {
                ability: character.ability,
                protagonist: character.protagonist,
                run_index: runIndex,
              });
              // #256 — world flag 주입 (이전 회차의 endingId 기반).
              const charWithFlags = {
                ...character,
                flags: { ...character.flags, ...worldFlags },
              };
              // #273 — 부메랑 flag 가 *실제 적용* 된 회차 트래킹.
              const appliedFlags = Object.keys(worldFlags).filter((k) => worldFlags[k]);
              if (appliedFlags.length > 0) {
                logAdvEvent("world_flag_applied", {
                  flags: appliedFlags.join(","),
                  flag_count: appliedFlags.length,
                  run_index: runIndex,
                });
              }
              dispatch({ type: "START_GAME", character: charWithFlags, startScene });
            }}
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
                  runIndex={runIndex}
                  onChoose={(choiceId) => {
                    // #245 — adv_choice_made. #285: protagonist + stigma_erosion 추가.
                    //   회차/시한부 분석을 위해 그 시점의 *주인공/침식* 캡처.
                    if (state.phase === "playing") {
                      const choice = scenes[state.currentScene]?.choices.find((c) => c.id === choiceId);
                      logAdvEvent("choice_made", {
                        scene_id: state.currentScene,
                        choice_id: choiceId,
                        choice_kind: choice?.kind,
                        protagonist: state.character.protagonist,
                        stigma_erosion: state.character.stigmaErosion,
                        run_index: runIndex,
                      });
                    }
                    dispatch({ type: "MAKE_CHOICE", choiceId });
                  }}
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
            finalScene={scenes[state.finalSceneId]}
            onRestart={() => dispatch({ type: "RESET" })}
          />
        )}
      </div>
    </main>
  );
}
