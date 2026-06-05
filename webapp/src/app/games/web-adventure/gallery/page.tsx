'use client';

// /games/web-adventure/gallery — 엔딩 갤러리 페이지 (#244).
//
// 데이터 흐름:
//   1. GET /api/web-adventure/past-runs 시도. 200 + 배열이면 사용.
//   2. 401 또는 실패 시 localStorage 의 'web-adventure:past-runs:v1' 읽기.
//   3. 둘 다 없으면 빈 배열 (모두 미도달 → 0/6).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import EndingGallery from './EndingGallery';
import { LOCAL_STORAGE_PAST_RUNS_KEY } from '@/lib/web-adventure/use-migrate-on-login';

interface PastRun {
  endingId: string;
  runIndex: number;
  finalSceneId: string;
}

export default function GalleryPage() {
  const [pastRuns, setPastRuns] = useState<PastRun[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/web-adventure/past-runs', { method: 'GET' });
        if (!cancelled && res.ok) {
          const json = (await res.json()) as { data?: PastRun[] };
          if (Array.isArray(json?.data)) {
            setPastRuns(json.data);
            return;
          }
        }
      } catch {
        /* 네트워크 실패 — 로컬 fallback */
      }
      if (cancelled) return;
      try {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_PAST_RUNS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as PastRun[];
          setPastRuns(Array.isArray(parsed) ? parsed : []);
          return;
        }
      } catch {
        /* parse 실패 — 무시 */
      }
      setPastRuns([]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-amber-50 text-amber-950 py-6 px-4">
      <div className="max-w-5xl mx-auto">
        <header className="mb-4 flex items-center justify-between flex-wrap gap-2">
          <div>
            <Link
              href="/games/web-adventure/play"
              className="text-xs text-amber-700 hover:underline"
            >
              ← 모험으로 돌아가기
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold mt-1">엔딩 갤러리</h1>
          </div>
        </header>

        {pastRuns === null ? (
          <p className="text-amber-700">불러오는 중…</p>
        ) : (
          <EndingGallery pastRuns={pastRuns} />
        )}
      </div>
    </main>
  );
}
