// useMigrateOnLogin — 로그인 직후 localStorage 의 save/past_runs 를 서버로 이전 (#240).

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}));

import { useSession } from 'next-auth/react';
import {
  useMigrateOnLogin,
  LOCAL_STORAGE_PAST_RUNS_KEY,
} from './use-migrate-on-login';
import { LOCAL_STORAGE_KEY } from './use-auto-save';

const fetchMock = vi.fn();

const sampleSave = {
  runIndex: 2,
  currentSceneId: 'cave_entry',
  character: {
    stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
    hp: 8,
    maxHp: 10,
    ability: 'scholar',
    inventory: [],
    flags: {},
    rerollsLeft: 2,
  },
};

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  localStorage.clear();
});

describe('useMigrateOnLogin', () => {
  it('미인증(unauthenticated) → fetch 호출 안 함', async () => {
    (useSession as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'unauthenticated' });
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sampleSave));
    renderHook(() => useMigrateOnLogin());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('인증 + localStorage 비어있음 → fetch 호출 안 함', async () => {
    (useSession as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'authenticated' });
    renderHook(() => useMigrateOnLogin());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('인증 + localStorage save 있음 → POST migrate-from-local 호출', async () => {
    (useSession as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'authenticated' });
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sampleSave));
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { migrated: true } }),
    });
    renderHook(() => useMigrateOnLogin());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/web-adventure/migrate-from-local',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('cave_entry'),
      }),
    );
  });

  it('인증 + past_runs 도 같이 전송', async () => {
    (useSession as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'authenticated' });
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sampleSave));
    localStorage.setItem(
      LOCAL_STORAGE_PAST_RUNS_KEY,
      JSON.stringify([
        {
          runIndex: 1,
          endingId: 'main',
          finalSceneId: 'x',
          character: sampleSave.character,
          completedAt: '2026-01-01',
        },
      ]),
    );
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { migrated: true } }) });
    renderHook(() => useMigrateOnLogin());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const call = fetchMock.mock.calls.find(
      ([url]) => url === '/api/web-adventure/migrate-from-local',
    );
    expect(call).toBeDefined();
    const sent = JSON.parse(call![1].body);
    expect(sent.save).toBeDefined();
    expect(sent.pastRuns).toHaveLength(1);
  });

  it('migrated:true 응답 → localStorage 정리', async () => {
    (useSession as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'authenticated' });
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sampleSave));
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { migrated: true } }),
    });
    renderHook(() => useMigrateOnLogin());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(localStorage.getItem(LOCAL_STORAGE_KEY)).toBeNull();
  });

  it('migrated:false (server_exists) → localStorage 유지', async () => {
    (useSession as ReturnType<typeof vi.fn>).mockReturnValue({ status: 'authenticated' });
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sampleSave));
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { migrated: false, reason: 'server_exists' } }),
    });
    renderHook(() => useMigrateOnLogin());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(localStorage.getItem(LOCAL_STORAGE_KEY)).not.toBeNull();
  });
});
