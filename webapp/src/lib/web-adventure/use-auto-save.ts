// useAutoSave - automatically saving and restoring Web Adventure progress (#238).
//
// Where it is used: the play page's PlayInner passes state and runIndex, and then
//   - on mount it tries GET /api/web-adventure/save; on failure (401) or null it falls back to the localStorage backup.
//     With something to restore it calls onRestore({ runIndex, currentSceneId, character }).
//   - only while state.phase === "playing", a state change debounces 1 second -> a POST attempt plus a localStorage backup.
//   - phase === "creating" and "ended" skip saving (moving to the next run after ended is handled by #239).
//
// It tries *both fetch and localStorage* whether logged in or not - even a server 401 falls back silently.

'use client';

import { useEffect, useRef } from 'react';
import type { Character, GameState } from '@/types/web-adventure';

export const LOCAL_STORAGE_KEY = 'web-adventure:save:v1';
const DEBOUNCE_MS = 1000;
const API_URL = '/api/web-adventure/save';

export interface AutoSavePayload {
  runIndex: number;
  currentSceneId: string;
  character: Character;
}

export interface UseAutoSaveOptions {
  runIndex: number;
  /** Called on mount when there is a save to restore from the server or locally */
  onRestore?: (payload: AutoSavePayload) => void;
  /** Overrides the debounce in ms (for tests) */
  debounceMs?: number;
}

function readLocal(): AutoSavePayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AutoSavePayload;
    if (
      typeof parsed?.runIndex === 'number' &&
      typeof parsed?.currentSceneId === 'string' &&
      parsed?.character
    ) {
      return parsed;
    }
  } catch {
    /* corrupted — 무시 */
  }
  return null;
}

function writeLocal(payload: AutoSavePayload): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota/private 모드 — 무시 */
  }
}

export function useAutoSave(state: GameState, options: UseAutoSaveOptions): void {
  const { runIndex, onRestore, debounceMs = DEBOUNCE_MS } = options;
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  // ── Restoring on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. try the server GET
      try {
        const res = await fetch(API_URL, { method: 'GET' });
        if (!cancelled && res.ok) {
          const json = (await res.json()) as { data?: AutoSavePayload | null };
          if (json?.data && json.data.character && json.data.currentSceneId) {
            onRestoreRef.current?.({
              runIndex: json.data.runIndex,
              currentSceneId: json.data.currentSceneId,
              character: json.data.character,
            });
            return;
          }
        }
      } catch {
        /* 네트워크 실패 — 로컬 fallback */
      }
      if (cancelled) return;
      // 2. the local fallback
      const local = readLocal();
      if (local) onRestoreRef.current?.(local);
    })();
    return () => {
      cancelled = true;
    };
    // 마운트 시 1회 — onRestore 는 ref 로 전달, deps 없음이 의도.
  }, []);

  // ── Debounced saving on a state change
  useEffect(() => {
    if (state.phase !== 'playing') return;
    const payload: AutoSavePayload = {
      runIndex,
      currentSceneId: state.currentScene,
      character: state.character,
    };
    const timer = setTimeout(() => {
      // localStorage always (robust offline).
      writeLocal(payload);
      // The server POST - a 401 fails silently.
      void fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then((res) => {
          if (res.ok) {
            // #273 - adv_save_persisted (on a successful server save).
            void import('./analytics').then(({ logAdvEvent }) => {
              logAdvEvent('save_persisted', {
                scene_id: payload.currentSceneId,
                run_index: payload.runIndex,
              });
            });
          }
        })
        .catch(() => {
          /* 네트워크 실패 — localStorage 만으로도 다음 세션에서 복원 가능 */
        });
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [state, runIndex, debounceMs]);
}
