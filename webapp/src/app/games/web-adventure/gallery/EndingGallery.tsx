'use client';

// EndingGallery - the Web Adventure's ending card grid (#244).
//
// A reached ending: icon, title, epilogue and the number of times reached.
// Unreached: a question mark and ???. The overall completion rate is shown.
// One column on mobile, two at sm, three at md.

import { endingsMeta, type EndingId } from '@/content/web-adventure/endings';

// The endings' display order (from good to bad). An ending missing from the list never appears in the gallery at all,
// so __tests__/ending-ids.test.ts keeps it in step with ENDING_IDS (#352).
export const ENDING_ORDER: EndingId[] = [
  'harmony',
  'ascension',
  'revolution',
  'sylvan_bond',
  'liberation',
  'wayfarer',
  'regency',
  'usurpation',
  'purge',
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
  // The number of times each ending was reached.
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
