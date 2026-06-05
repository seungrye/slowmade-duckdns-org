// 이슈 검증: 엔딩 도달 후 갤러리 갱신 안 됨 (#250).
//
// 가설: 비로그인 사용자의 엔딩 도달이 localStorage 의 past-runs 키에 안 적치되어
// 갤러리 페이지가 영원히 0/6 표시. 코드 검토 결과 LOCAL_STORAGE_PAST_RUNS_KEY 는
// gallery + use-migrate-on-login 에서 read 만 됨, write 코드 없음.
//
// 이 테스트는 *기대 동작* (비로그인이라도 localStorage 에 past-run append) 를
// 검증. 현재 코드는 append 안 하므로 RED → 사용자 문제 = 진짜 문제.
//
// 시뮬레이션 경로 (가장 짧음): shopkeeper 엔딩
//   광장 → '광장 옆 행상인에게 다가간다' (to_peddler) → '시장에 정착한다' (settle_market) → ended.

// @vitest-environment jsdom

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'unauthenticated', data: null }),
}));
vi.mock('next/font/google', () => ({
  Manrope: () => ({ className: 'manrope' }),
}));

import PlayPage from './page';
import { resetSceneCache } from '@/lib/web-adventure/engine/sceneRegistry';
import { scenes as staticScenes } from '@/lib/web-adventure/engine/sceneRegistry';
import { LOCAL_STORAGE_PAST_RUNS_KEY } from '@/lib/web-adventure/use-migrate-on-login';

describe('이슈 #250 — 엔딩 도달 후 갤러리 갱신 안 됨 (RED)', () => {
  beforeEach(() => {
    resetSceneCache();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('비로그인 사용자가 엔딩 도달 시 localStorage 의 past-runs 에 항목이 append 된다', async () => {
    // 모든 API 401 (비로그인) + content/v1 정상.
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/content/v1')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { scenes: Object.values(staticScenes) } }),
        });
      }
      // save GET / save POST / end-run POST / migrate-from-local 모두 비로그인 → 401.
      return Promise.resolve({ ok: false, status: 401, json: async () => ({ error: 'auth' }) });
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<PlayPage />);

    // 씬 로드 후 캐릭터 생성 노출.
    await waitFor(() => {
      expect(screen.getByText(/캐릭터 생성/)).toBeInTheDocument();
    });

    // 보너스 5 포인트 분배 — STR/DEX/INT/CHA/CON 각 +1.
    for (const label of ['힘 (str) 증가', '민첩 (dex) 증가', '지능 (int) 증가', '카리스마 (cha) 증가', '체력 (con) 증가']) {
      fireEvent.click(screen.getByLabelText(label));
    }

    // 모험 시작.
    fireEvent.click(screen.getByRole('button', { name: /모험 시작/ }));

    // 광장에서 'to_peddler' (행상인) 선택.
    await waitFor(() => {
      expect(screen.getByText(/광장 옆 행상인에게 다가간다/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/광장 옆 행상인에게 다가간다/));

    // peddler 에서 settle_market 선택 → shopkeeper 엔딩.
    await waitFor(() => {
      expect(screen.getByText(/시장에 정착한다/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/시장에 정착한다/));

    // 엔딩 화면 진입.
    await waitFor(() => {
      expect(screen.getByTestId('ending-screen')).toBeInTheDocument();
    });

    // ── 핵심: localStorage 의 past-runs 에 항목 1개 (shopkeeper) ──
    await waitFor(() => {
      const raw = localStorage.getItem(LOCAL_STORAGE_PAST_RUNS_KEY);
      expect(raw).not.toBeNull();
      const arr = raw ? JSON.parse(raw) : [];
      expect(Array.isArray(arr)).toBe(true);
      expect(arr.length).toBeGreaterThanOrEqual(1);
      expect(arr.some((r: { endingId?: string }) => r?.endingId === 'shopkeeper')).toBe(true);
    });
  });
});
