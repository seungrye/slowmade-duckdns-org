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

/**
 * 문체 지정 — /play?voice=tolkien (#73).
 *
 * useSearchParams 대신 location 을 직접 읽어 Suspense 경계를 늘리지 않는다.
 */
function readVoice(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("voice") ?? undefined;
}

/**
 * 이번 판의 문체를 정해 씬을 받아온다 (#79).
 *
 * 클라이언트가 받는 씬에는 variants 가 없어 완비 여부를 알 수 없으므로, 우선 한 번 받아
 * 커버리지를 확보한 뒤 문체를 고른다. 고른 값은 sessionStorage 에 남겨 한 판 안에서는
 * 씬마다 문체가 갈리지 않게 한다. `?voice=` 를 준 경우엔 그것이 우선한다.
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

/** 이번 판에 쓰인 문체 — end-run 에 함께 보낸다 (#90). 없으면 기본 문체로 본다. */
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

  // #240 — 로그인 직후 localStorage 의 save/past_runs → 서버 이전 (한 번만).
  useMigrateOnLogin();

  // #238 — 자동 저장 + 마운트 시 복원.
  // #239 — 회차 시스템: ended 진입 시 end-run API 호출 + runIndex +1.
  // #256 — world flag 부메랑: 이전 회차 endingId → world.* flags 주입.
  const [runIndex, setRunIndex] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [worldFlags, setWorldFlags] = useState<Record<string, boolean>>({});
  // 엔딩 진입 1회만 end-run 을 보내기 위한 가드. sentKey 에 runIndex 를 넣던 방식은
  // 성공 시 setRunIndex(n+1) 로 runIndex 가 바뀌면 키가 달라져 effect 가 재발화 → end-run
  // 무한 루프(회차/피드백노트 폭주, #17)를 유발했다. phase 전이 기반 boolean 가드로 교체.
  const endRunHandledRef = useRef(false);
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
  //   같은 runIndex 중복 전송 방지.
  // #253 — 비로그인도 서버가 받는다(합성 계정 past-run + 피드백 노트). 예전엔 401 이라
  //   조용히 버려져서, 로그인 안 한 플레이의 엔딩은 피드백 노트가 아예 안 생겼다.
  // #245 — adv_ending_reached 도 같이 발화.
  // #250 — 서버 응답과 무관하게 localStorage 에 *동기 append* (이슈 #250).
  //   비로그인이면 갤러리 fallback 만 의지. 로그인이면 race 보호 (end-run insert
  //   가 끝나기 전 갤러리 진입해도 localStorage 의 최신 도달분이 보임). dedup
  //   runIndex 기준.
  useEffect(() => {
    // 엔딩 phase 를 벗어나면(새 회차 시작) 가드 리셋 → 다음 엔딩에서 다시 1회 발화.
    if (state.phase !== "ended") {
      endRunHandledRef.current = false;
      return;
    }
    // 이미 이 엔딩을 처리했으면 재발화(runIndex 변경 등) 무시 → end-run 1회만.
    if (endRunHandledRef.current) return;
    endRunHandledRef.current = true;

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
        // #9 — 엔딩 시점의 풍부한 서사 로그를 서버로. 피드백 노트 LLM 입력용.
        log: state.log,
        // #90 — 어떤 문체로 읽은 회차인지. 노트가 인용한 문장의 출처를 추적할 수 있다.
        voice: readRunVoice(),
        // #253 — 비로그인은 서버 save 가 없어 캐릭터를 서버가 알 수 없다. 안 보내면
        //   기본값(kael·hp10)으로 채워져 노트 서사가 실제 플레이와 어긋난다.
        //   로그인 사용자는 서버가 save 의 캐릭터를 쓰므로 이 값은 무시된다.
        character: state.character,
      }),
    })
      .then(async (res) => {
        if (res.ok) {
          setRunIndex((n) => n + 1);
          return;
        }
        // #352 — **실패를 삼키지 않는다.** 예전엔 `if (res.ok)` 뿐이라 서버가 거절해도
        //   아무 흔적이 없었다. 실제로 엔딩 5종이 스키마 enum 에 빠져 전부 500 이었는데
        //   플레이어에게도 로그에도 안 남아 2주 넘게 몰랐다. 회차 기록이 사라지면
        //   피드백 노트·갤러리·업적이 통째로 날아간다.
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
        // 네트워크 단절 — 여기서만은 회복 가능성이 있다(다음 게임 시작 시 save 갱신).
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
                  pendingRoll={state.pendingRoll}
                  rerollsLeft={state.character.rerollsLeft}
                  onReroll={() => dispatch({ type: "REROLL" })}
                  onConfirm={() => dispatch({ type: "CONFIRM_ROLL" })}
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
