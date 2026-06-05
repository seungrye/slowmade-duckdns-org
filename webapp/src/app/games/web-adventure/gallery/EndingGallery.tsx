'use client';

// EndingGallery — Web Adventure 의 6 엔딩 카드 그리드 (#244).
//
// 도달한 엔딩: icon + title + epilogue + 도달 카운트.
// 미도달: ❓ + ???. 전체 도달률 표시.
// 모바일 1열 / sm 2열 / md 3열.

import { endingsMeta, type EndingId } from '@/content/web-adventure/endings';

// #253 〈에테르니아〉 — 6 엔딩 (좋음 → 나쁨 흐름).
const ENDING_ORDER: EndingId[] = [
  'harmony',
  'ascension',
  'revolution',
  'sylvan_bond',
  'fall',
  'petrification',
];

interface PastRunSummary {
  endingId: string;
}

export interface EndingGalleryProps {
  pastRuns: PastRunSummary[];
}

export default function EndingGallery({ pastRuns }: EndingGalleryProps) {
  // 엔딩 별 도달 카운트.
  const counts: Record<string, number> = {};
  for (const r of pastRuns) {
    counts[r.endingId] = (counts[r.endingId] ?? 0) + 1;
  }
  const reachedCount = ENDING_ORDER.filter((id) => counts[id] > 0).length;

  return (
    <section className="rounded-lg bg-amber-100/70 border border-amber-300 p-4 shadow-sm">
      <header className="flex items-baseline justify-between mb-4">
        <h2 className="text-xl font-bold">엔딩 갤러리</h2>
        <span data-testid="gallery-progress" className="text-sm text-amber-800">
          <span className="font-mono font-bold">{reachedCount}</span> / 6
        </span>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {ENDING_ORDER.map((id) => {
          const count = counts[id] ?? 0;
          const reached = count > 0;
          const meta = endingsMeta[id];
          return (
            <div
              key={id}
              data-testid={`ending-card-${id}`}
              data-reached={reached ? 'true' : 'false'}
              className={`rounded-md border p-3 ${
                reached
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-amber-50/30 border-amber-200/40 text-amber-700/60'
              }`}
            >
              <div className="text-4xl text-center mb-1" aria-hidden>
                {reached ? meta.icon : '❓'}
              </div>
              <div className="text-center font-bold">
                {reached ? meta.title : '???'}
              </div>
              {reached && (
                <>
                  <p className="text-xs mt-2 line-clamp-3 text-amber-900">
                    {meta.epilogue}
                  </p>
                  <div className="mt-2 text-xs text-amber-700 text-right">
                    {count}회 도달
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
