// Verifying the issue: even a logged-in user gets a blank screen when entering the gallery before the end-run POST completes.
//
// The (secondary) hypothesis: the play page's ended useEffect is a *void fetch* - asynchronous.
// A client entering the gallery page at once GETs *before the past_run insert* -> an empty list.
// A localStorage update, being *synchronous*, could show it immediately as the solution.
//
// This test verifies that the gallery page reflects *a synchronous write of past-runs to localStorage*
// immediately. The gallery page's current fallback runs *only on a 401* -
// a 200 with an empty array never looks at localStorage. In the user's real scenarios:
//   - logged out: always a 401 -> the localStorage fallback. With localStorage empty it is 0/6.
//   - logged in with the race: a 200 plus an empty array -> localStorage ignored. *The recent ending is invisible*.
//
// This test expects *a logged-in user's recent endings in localStorage to be merged in and shown*
// - currently localStorage is ignored whenever *the server responds 200*. RED.

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
    // The server GET past-runs -> 200 plus an empty array (the end-run insert has not finished).
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: [] }),
      }),
    );

    // One recent ending in localStorage (main).
    localStorage.setItem(
      LOCAL_STORAGE_PAST_RUNS_KEY,
      JSON.stringify([
        {
          endingId: 'ascension',
          runIndex: 1,
          finalSceneId: 'ending_main',
          completedAt: '2026-06-06T00:00:00Z',
        },
      ]),
    );

    render(<GalleryPage />);

    // A completion rate of 1 / 6 is expected (the server's empty array plus localStorage's 1, merged to 1).
    await waitFor(() => {
      const progress = screen.getByTestId('gallery-progress');
      expect(progress).toHaveTextContent('1 / 6');
    });
  });
});
