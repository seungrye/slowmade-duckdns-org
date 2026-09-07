"use client";

import { useEffect, useReducer, useRef, useState, useCallback } from "react";
import type { GameState, SceneRegistry } from "@/types/web-adventure";
import { gameReducer, type Action } from "@/lib/web-adventure/engine/reducer";
import { getScenes, getVoiceCoverage } from "@/lib/web-adventure/engine/sceneRegistry";
import { chooseRunVoice, DEFAULT_VOICE, RUN_VOICE_KEY } from "@/lib/web-adventure/voice";
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

// The CSR play screen - a reducer-based state machine.
//
// The Phase D change: instead of statically imported scenes, the mongo content is fetched from
// `/api/web-adventure/content/v1` and injected into the reducer. It has three UI states:
// loading, a failed fetch, and normal.
//
// The render per phase:
//   creating → CharacterCreator
//   playing  -> the top status (HP, inventory, rerolls) plus SceneRenderer
//   ended    → EndingScreen

const initialState: GameState = { phase: "creating" };

/**
 * Choosing the prose style - /play?voice=tolkien (#73).
 *
 * It reads location directly rather than using useSearchParams, so no extra Suspense boundary is needed.
 */
function readVoice(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("voice") ?? undefined;
}

/**
 * Decides this run's prose style and fetches the scenes (#79).
 *
 * The scenes the client receives have no variants, so completeness cannot be told from them; it fetches once to get
 * the coverage and then picks a style. The chosen value is kept in sessionStorage so the style does not vary
 * scene by scene within a run. A given `?voice=` wins.
 */
async function loadScenesForRun(force = false): Promise<SceneRegistry> {
  const override = readVoice();
  const first = await getScenes({ force, voice: override });
  if (override) return first;

  const voice = chooseRunVoice({
    coverage: getVoiceCoverage(),
    storage: typeof window === "undefined" ? undefined : window.sessionStorage,
  });
  if (voice === DEFAULT_VOICE) return first;
  return getScenes({ force, voice });
}

/** The style used in this run - sent along with end-run (#90). Absent, it counts as the default style. */
function readRunVoice(): string {
  if (typeof window === "undefined") return DEFAULT_VOICE;
  try {
    return window.sessionStorage.getItem(RUN_VOICE_KEY) || DEFAULT_VOICE;
  } catch {
    return DEFAULT_VOICE;
  }
}

export default function WebAdventurePlayPage() {
  const [scenes, setScenes] = useState<SceneRegistry | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadScenes = useCallback(() => {
    setError(null);
    setScenes(null);
    loadScenesForRun(true)
      .then((data) => setScenes(data))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadScenesForRun()
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

  // #240 - right after login, localStorage's save and past_runs migrate to the server (once only).
  useMigrateOnLogin();

  // #238 - autosave plus restoring on mount.
  // #239 - the run system: entering ended calls the end-run API and bumps runIndex.
  // #256 - the world-flag boomerang: the previous run's endingId injects world.* flags.
  const [runIndex, setRunIndex] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [worldFlags, setWorldFlags] = useState<Record<string, boolean>>({});
  // The guard that sends end-run only once on entering an ending. Putting runIndex in sentKey meant that on
  // success setRunIndex(n+1) changed runIndex, changed the key and re-fired the effect -> an infinite end-run
  // loop (a flood of runs and feedback notes, #17). It was replaced by a boolean guard on the phase transition.
  const endRunHandledRef = useRef(false);
  // #273 - tracking the first time contamination reaches 80 (once per run). A useRef sentinel.
  const stigmaCriticalSentRef = useRef<number | null>(null);
  // Tracking the sequence of scenes passed through (for path-distribution statistics) - sent to the server with end-run.
  const scenePathRef = useRef<string[]>([]);

  // #256 - past_runs is fetched on mount to compute worldFlags.
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

  // #273 - fires once, in the run where contamination first reaches 80 (critical).
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

  // Path tracking - a changed currentScene while playing appends to the sequence.
  //   Returning to creating (before a run starts) resets it. RESTORE (continuing) starts mid-way, so
  //   the path can be incomplete, but most sessions are new adventures so it is accepted.
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

  // #239 - entering ended POSTs end-run once, bumping the save's runIndex and accumulating a past_run.
  //   Duplicate sends for the same runIndex are prevented.
  // #253 - the server accepts a logged-out player too (a synthetic account's past-run plus a feedback note). It used to
  //   be a 401 and be quietly discarded, so a logged-out play's ending produced no feedback note at all.
  // #245 - adv_ending_reached fires with it.
  // #250 - a *synchronous append* to localStorage regardless of the server's response (issue #250).
  //   Logged out, only the gallery fallback depends on it. Logged in, it guards the race (entering the
  //   gallery before the end-run insert finishes still shows the most recent ending from localStorage). Deduplicated
  //   by runIndex.
  useEffect(() => {
    // Leaving the ending phase (starting a new run) resets the guard -> it fires once again at the next ending.
    if (state.phase !== "ended") {
      endRunHandledRef.current = false;
      return;
    }
    // Once this ending is handled, a re-fire (a changed runIndex and so on) is ignored -> end-run happens once.
    if (endRunHandledRef.current) return;
    endRunHandledRef.current = true;

    // Appends to localStorage's past-runs (deduplicated by runIndex).
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
          // #289 - the character snapshot is removed. EndingGallery and buildWorldFlags both use
          //   the endingId alone. Including the character accumulated about 260B per run, so ten thousand runs
          //   filled half of the 5MB quota and silently skipped in production.
          //   The real snapshot is kept in *the server's past-runs* alone.
          completedAt: new Date().toISOString(),
        });
        // Only the most recent 200 runs are kept - buildWorldFlags needs only the *unique endingIds*.
        const trimmed = filtered.slice(-200);
        window.localStorage.setItem(
          LOCAL_STORAGE_PAST_RUNS_KEY,
          JSON.stringify(trimmed),
        );
      } catch {
        /* quota/private 모드 — 무시 */
      }

      // #251 - clears the progress data in localStorage's save (= ending the run).
      //   Symmetrical with the server end-run's unset of character and currentSceneId.
      //   On the next mount, useAutoSave's onRestore finds no currentSceneId and
      //   skips RESTORE -> the creating phase (= 'a new adventure').
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
    // #273 - automatic petrification (the automatic transition at stigma >= 100) is tracked separately.
    //   The current content has no *branch* into petrification, so it is *always* automatic.
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
        // #9 - the rich narrative log at the ending goes to the server. Input for the feedback note's LLM.
        log: state.log,
        // #90 - which prose style this run was read in. It lets a note's quoted sentence be traced to its source.
        voice: readRunVoice(),
        // #253 - a logged-out player has no server save, so the server cannot know the character. Not sending it
        //   fills in the defaults (kael, hp 10) and the note's narrative diverges from the actual play.
        //   For a logged-in user the server uses the save's character, so this value is ignored.
        character: state.character,
      }),
    })
      .then(async (res) => {
        if (res.ok) {
          setRunIndex((n) => n + 1);
          return;
        }
        // #352 - **failures are not swallowed.** This used to be `if (res.ok)` alone, so a server rejection
        //   left no trace. In practice 5 endings were absent from the schema enum and all returned 500, and
        //   with nothing shown to the player and nothing in the log it went unnoticed for over two weeks. A lost run record
        //   takes the feedback note, the gallery and the achievements with it.
        const detail = await res.json().catch(() => null);
        const reason = detail?.message ?? `HTTP ${res.status}`;
        console.error("[web-adventure] 회차 저장 실패 — 기록이 남지 않았다:", reason);
        logAdvEvent("ending_save_failed", {
          ending_id: state.endingId,
          run_index: runIndex,
          status: res.status,
          reason: String(reason).slice(0, 120),
        });
      })
      .catch((err) => {
        // A network drop - here alone there is a chance of recovery (the save refreshes at the next game start).
        console.error("[web-adventure] 회차 저장 요청 자체가 실패했다:", err);
        logAdvEvent("ending_save_failed", {
          ending_id: state.endingId,
          run_index: runIndex,
          status: 0,
          reason: "network",
        });
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
              // #256 - injecting the world flags (based on the previous run's endingId).
              const charWithFlags = {
                ...character,
                flags: { ...character.flags, ...worldFlags },
              };
              // #273 - tracking the runs where a boomerang flag *actually applied*.
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
                  pendingRoll={state.pendingRoll}
                  rerollsLeft={state.character.rerollsLeft}
                  onReroll={() => dispatch({ type: "REROLL" })}
                  onConfirm={() => dispatch({ type: "CONFIRM_ROLL" })}
                  onChoose={(choiceId) => {
                    // #245 - adv_choice_made. #285: protagonist and stigma_erosion added.
                    //   The *protagonist and contamination* at that moment are captured for run and time-limit analysis.
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
                />
              </div>
            </div>

            {/* 모바일 drawer — 같은 StatusPanel + 갤러리 링크 */}
            <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
              <StatusPanel
                character={state.character}
                runIndex={runIndex}
                onUseItem={(itemId) => dispatch({ type: "USE_ITEM", itemId })}
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
