// 이슈 검증: 로그인 사용자라도 end-run POST 완료 전 갤러리 진입 시 빈 화면.
//
// 가설 (보조): play page 의 ended useEffect 가 *void fetch* — 비동기.
// 클라이언트가 즉시 갤러리 페이지 진입하면 *past_run insert 전* GET → 빈 목록.
// 해결책으로는 localStorage 가 *동기적으로* update 되면 즉시 반영 가능.
//
// 이 테스트는 *localStorage 의 past-runs 가 동기 write 됐을 때* 갤러리 페이지가
// 즉시 반영하는지 검증. 현재 갤러리 페이지의 fallback 코드는 *401 시* 만 동작 —
// 200+빈배열일 경우 localStorage 안 봄. 사용자 진짜 시나리오에서는:
//   - 비로그인: 매번 401 → localStorage fallback. localStorage 가 비어있으면 0/6.
//   - 로그인 + race: 200 + 빈 배열 → localStorage 무시. *최근 도달 안 보임*.
//
// 이 테스트는 *로그인 사용자도 localStorage 의 최근 도달분이 있으면 합쳐서 표시*
// 하는 동작을 기대 — 현재는 *서버 응답이 200* 이면 localStorage 무시. RED.

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import GalleryPage from './page';
import { LOCAL_STORAGE_PAST_RUNS_KEY } from '@/lib/web-adventure/use-migrate-on-login';

describe('이슈 #250 — 갤러리 race condition (RED)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('서버가 200 + 빈배열 + localStorage 에 최근 past_run 있으면 합쳐서 표시', async () => {
    // 서버 GET past-runs → 200 + 빈 배열 (end-run insert 가 아직 안 끝남).
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: [] }),
      }),
    );

    // localStorage 에 최근 도달분 1 (main).
    localStorage.setItem(
      LOCAL_STORAGE_PAST_RUNS_KEY,
      JSON.stringify([
        {
          endingId: 'main',
          runIndex: 1,
          finalSceneId: 'ending_main',
          completedAt: '2026-06-06T00:00:00Z',
        },
      ]),
    );

    render(<GalleryPage />);

    // 도달률 1 / 6 표시 기대 (서버 빈 배열 + localStorage 1 → 합쳐서 1).
    await waitFor(() => {
      const progress = screen.getByTestId('gallery-progress');
      expect(progress).toHaveTextContent('1 / 6');
    });
  });
});
