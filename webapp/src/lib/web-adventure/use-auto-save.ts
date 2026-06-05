// useAutoSave — Web Adventure 진행도 자동 저장 + 복원 (#238).
//
// 사용처: play page 의 PlayInner 가 state, runIndex 를 넘기면
//   - 마운트 시 GET /api/web-adventure/save 시도 → 실패(401)/null 이면 localStorage 의 백업으로 fallback.
//     복원할 데이터가 있으면 onRestore({ runIndex, currentSceneId, character }) 호출.
//   - state.phase==="playing" 일 때만, state 변경 후 1초 디바운스 → POST 시도 + localStorage 백업.
//   - phase==="creating" / "ended" 는 저장 skip (ended 후 회차 전환은 #239 처리).
//
// 로그인/비로그인 구분 없이 *fetch + localStorage* 둘 다 시도 — 서버 401 도 silent fallback.

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
  /** 마운트 시 서버/로컬 에서 복원할 save 가 있으면 콜백 */
  onRestore?: (payload: AutoSavePayload) => void;
  /** 디바운스 ms 오버라이드 (테스트용) */
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

  // ── 마운트 시 복원
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. 서버 GET 시도
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
      // 2. 로컬 fallback
      const local = readLocal();
      if (local) onRestoreRef.current?.(local);
    })();
    return () => {
      cancelled = true;
    };
    // 마운트 시 1회.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── state 변경 시 디바운스 저장
  useEffect(() => {
    if (state.phase !== 'playing') return;
    const payload: AutoSavePayload = {
      runIndex,
      currentSceneId: state.currentScene,
      character: state.character,
    };
    const timer = setTimeout(() => {
      // localStorage 는 항상 (오프라인 견고함).
      writeLocal(payload);
      // 서버 POST — 401 이면 silent fail.
      void fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {
        /* 네트워크 실패 — localStorage 만으로도 다음 세션에서 복원 가능 */
      });
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [state, runIndex, debounceMs]);
}
