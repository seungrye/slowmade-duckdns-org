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
import { logAdvEvent } from '@/lib/web-adventure/analytics';

interface PastRun {
  endingId: string;
  runIndex: number;
  finalSceneId: string;
}

export default function GalleryPage() {
  const [pastRuns, setPastRuns] = useState<PastRun[] | null>(null);

  // #245 — adv_gallery_view (마운트 시 1회).
  useEffect(() => {
    logAdvEvent('gallery_view');
  }, []);

  // #250 — 서버 응답이 200 이라도 localStorage 의 최신 도달분(race 또는 비로그인
  //   write) 을 *합집합* 으로 표시. dedup 은 runIndex 기준, 서버 우선.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let serverList: PastRun[] = [];
      try {
        const res = await fetch('/api/web-adventure/past-runs', { method: 'GET' });
        if (res.ok) {
          const json = (await res.json()) as { data?: PastRun[] };
          if (Array.isArray(json?.data)) serverList = json.data;
        }
      } catch {
        /* 네트워크 실패 — localStorage 만으로 */
      }
      if (cancelled) return;

      let localList: PastRun[] = [];
      try {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_PAST_RUNS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) localList = parsed as PastRun[];
        }
      } catch {
        /* parse 실패 — 무시 */
      }

      // dedup by runIndex (server 우선).
      const serverIdx = new Set(serverList.map((r) => r.runIndex));
      const merged = [
        ...serverList,
        ...localList.filter((r) => !serverIdx.has(r.runIndex)),
      ];
      setPastRuns(merged);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-amber-50 text-amber-950 py-6 px-4 web-adventure-page">
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
