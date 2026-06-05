// useAutoSave 훅 단위 테스트 (#238).
//
// 자동 저장 흐름:
//   - 로그인 사용자: state 변경 → 1초 디바운스 → POST /api/web-adventure/save.
//   - 비로그인: 동일하게 localStorage 에 저장.
//   - 페이지 진입 시: 로그인이면 GET, 비로그인은 localStorage 읽어 onRestore 콜백.
//   - phase==="playing" 일 때만 저장. creating/ended 는 skip.
//
// 정책: 로그인 시 *둘 다* 저장 (서버 + localStorage backup) — 오프라인 견고함.

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { GameState, Character } from '@/types/web-adventure';
import { useAutoSave, LOCAL_STORAGE_KEY } from './use-auto-save';

function makeCharacter(): Character {
  return {
    stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
    hp: 8,
    maxHp: 10,
    ability: 'lunar',
    protagonist: 'kael',
    stigmaErosion: 0,
    inventory: ['torch'],
    flags: {},
    rerollsLeft: 2,
  };
}

const playingState: GameState = {
  phase: 'playing',
  character: makeCharacter(),
  currentScene: 'cave_entry',
  log: [],
};

const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAutoSave — 디바운스 저장', () => {
  it('phase==="playing" + 1초 후 fetch POST 호출', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: null }) });
    renderHook(() => useAutoSave(playingState, { runIndex: 1 }));
    // 디바운스 시간 못 됐을 때는 POST 호출 안 됨 (GET 은 마운트 시 별도)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    const postCallsAt500 = fetchMock.mock.calls.filter(
      ([url, init]) => url === '/api/web-adventure/save' && init?.method === 'POST',
    );
    expect(postCallsAt500.length).toBe(0);

    // 1초 경과
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    const postCalls = fetchMock.mock.calls.filter(
      ([url, init]) => url === '/api/web-adventure/save' && init?.method === 'POST',
    );
    expect(postCalls.length).toBe(1);
  });

  it('phase==="creating" 일 때는 저장 안 함', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: null }) });
    renderHook(() => useAutoSave({ phase: 'creating' }, { runIndex: 1 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    const postCalls = fetchMock.mock.calls.filter(
      ([url, init]) => url === '/api/web-adventure/save' && init?.method === 'POST',
    );
    expect(postCalls.length).toBe(0);
    expect(localStorage.getItem(LOCAL_STORAGE_KEY)).toBeNull();
  });

  it('localStorage 에도 저장 (오프라인 백업)', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: null }) });
    renderHook(() => useAutoSave(playingState, { runIndex: 1 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    expect(raw).not.toBeNull();
    if (raw) {
      const parsed = JSON.parse(raw);
      expect(parsed.runIndex).toBe(1);
      expect(parsed.currentSceneId).toBe('cave_entry');
      expect(parsed.character.hp).toBe(8);
    }
  });

  it('서버 401(비로그인) → fetch 실패 시 localStorage 만 (조용히)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'auth' }) });
    renderHook(() => useAutoSave(playingState, { runIndex: 1 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    // localStorage 저장은 됨 (오프라인 동작 보장).
    expect(localStorage.getItem(LOCAL_STORAGE_KEY)).not.toBeNull();
  });
});

describe('useAutoSave — 마운트 시 복원 (realTimers 사용)', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('서버 GET 으로 save 받으면 onRestore 콜백 호출', async () => {
    const serverSave = {
      runIndex: 2,
      currentSceneId: 'market_morning',
      character: makeCharacter(),
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: serverSave }),
    });
    const onRestore = vi.fn();
    renderHook(() => useAutoSave({ phase: 'creating' }, { runIndex: 1, onRestore }));
    // 마운트 useEffect 의 async fetch 완료 대기.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onRestore).toHaveBeenCalled();
    const arg = onRestore.mock.calls[0][0];
    expect(arg.currentSceneId).toBe('market_morning');
    expect(arg.runIndex).toBe(2);
  });

  it('서버 401 + localStorage 있음 → localStorage 의 save 로 복원', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    const localSave = {
      runIndex: 3,
      currentSceneId: 'forest_entry',
      character: makeCharacter(),
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localSave));
    const onRestore = vi.fn();
    renderHook(() => useAutoSave({ phase: 'creating' }, { runIndex: 1, onRestore }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onRestore).toHaveBeenCalledWith(
      expect.objectContaining({ currentSceneId: 'forest_entry', runIndex: 3 }),
    );
  });

  it('서버/로컬 모두 없음 → onRestore 호출 안 함', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: null }) });
    const onRestore = vi.fn();
    renderHook(() => useAutoSave({ phase: 'creating' }, { runIndex: 1, onRestore }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onRestore).not.toHaveBeenCalled();
  });
});
