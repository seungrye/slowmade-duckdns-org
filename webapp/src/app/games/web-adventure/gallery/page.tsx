'use client';

// /games/web-adventure/gallery - the ending gallery page (#244).
//
// The data flow:
//   1. try GET /api/web-adventure/past-runs. Use it on a 200 with an array.
//   2. on a 401 or a failure, read localStorage's 'web-adventure:past-runs:v1'.
//   3. with neither, an empty array (nothing reached -> 0/6).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import EndingGallery from './EndingGallery';
import { LOCAL_STORAGE_PAST_RUNS_KEY } from '@/lib/web-adventure/use-migrate-on-login';
import { logAdvEvent } from '@/lib/web-adventure/analytics';
import { buildWorldFlags, ENDING_TO_WORLD_FLAG } from '@/lib/web-adventure/world-flags';
import type { EndingId } from '@/types/web-adventure';

interface PastRun {
  endingId: string;
  runIndex: number;
  finalSceneId: string;
}

export default function GalleryPage() {
  const [pastRuns, setPastRuns] = useState<PastRun[] | null>(null);

  // #245 - adv_gallery_view (once on mount).
  useEffect(() => {
    logAdvEvent('gallery_view');
  }, []);

  // #250 - even on a 200, localStorage's most recent endings (from the race or a logged-out
  //   write) are shown as a *union*. Deduplication is by runIndex, with the server winning.
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

      // deduplicated by runIndex (the server wins).
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
              className="text-xs text-amber-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-1 rounded"
            >
              ← 모험으로 돌아가기
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold mt-1">엔딩 갤러리</h1>
          </div>
        </header>

        {pastRuns === null ? (
          <p className="text-amber-700">불러오는 중…</p>
        ) : (
          <>
            <EndingGallery pastRuns={pastRuns} />
            <WorldFlagBanner pastRuns={pastRuns} />
          </>
        )}
      </div>
    </main>
  );
}

// #280 - states the world flags that will apply to the next run. It makes the cross-run boomerang system *visible*.
function WorldFlagBanner({ pastRuns }: { pastRuns: Array<{ endingId: string }> }) {
  const flags = buildWorldFlags(pastRuns);
  const activeKeys = Object.keys(flags).filter((k) => flags[k]);
  if (activeKeys.length === 0) return null;

  // flag -> the reverse mapping of which ending it came from.
  const REVERSE: Record<string, EndingId> = Object.fromEntries(
    (Object.entries(ENDING_TO_WORLD_FLAG) as Array<[EndingId, string]>).map(([e, f]) => [f, e]),
  );
  const FLAG_LABEL: Record<EndingId, string> = {
    ascension: '✨ 사제단 강화 (이전 승천)',
    revolution: '⚙️ 아이언가드 무장 (이전 혁명)',
    harmony: '☯ 마법 본질 회복 (이전 조화)',
    fall: '💀 잿더미 메아리 (이전 추락)',
    petrification: '🗿 결정체의 빛 (이전 석화)',
    sylvan_bond: '🌿 영수의 기억 (이전 정령 결속)',
    liberation: '🔓 풀려난 진실 (이전 해방)',
    usurpation: '👁 거짓 신좌 (이전 찬탈)',
    regency: '👑 변질된 권력 (이전 권좌)',
    purge: '🩸 지워진 이름 (이전 숙청)',
    wayfarer: '🧭 떠난 자의 소문 (이전 여로)',
  };

  return (
    <section
      data-testid="world-flag-banner"
      className="mt-6 rounded-lg bg-indigo-100/70 border border-indigo-300 p-4 shadow-sm"
    >
      <h3 className="text-base font-bold text-indigo-900 mb-2">다음 회차의 부메랑</h3>
      <p className="text-xs text-indigo-800 mb-3">
        이전 회차의 결과가 다음 모험의 분기를 *해금* 한다. 새 길은 *옅게 표시되거나 숨겨* 있다.
      </p>
      <ul className="flex flex-wrap gap-2">
        {activeKeys.map((k) => {
          const eid = REVERSE[k];
          return (
            <li
              key={k}
              data-testid={`world-flag-${eid}`}
              className="rounded-md bg-white/80 border border-indigo-200 px-3 py-1 text-xs font-medium text-indigo-900"
            >
              {FLAG_LABEL[eid] ?? k}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
