// The table pager (#184).
//
// Taken out of `admin/trading/monitor`, where it lived alone, and made shared - the trade detail screen's two tables
// need the same shape. The component behaves exactly as it did before the move.
//
// The arithmetic is pulled out. Where paging goes wrong is almost always **the boundaries** (0 rows, an exact
// division, a page out of range), and only a pure function lets every one of those cases be poked at.

/** The total number of pages. 1 even with 0 rows - so nothing reads `0 / 0`. */
export function pageCount(total: number, size: number): number {
  if (size <= 0) return 1;
  return Math.max(1, Math.ceil(total / size));
}

/**
 * Pulls page back into the valid range.
 *
 * When the data shrinks (changing a filter, for instance) the page held goes out of range. Left alone,
 * an empty table appears.
 */
export function clampPage(page: number, total: number, size: number): number {
  return Math.min(Math.max(0, page), pageCount(total, size) - 1);
}

/** That page's items. A page out of range counts as the last page. */
export function pageSlice<T>(items: T[], page: number, size: number): T[] {
  if (size <= 0) return items;
  const p = clampPage(page, items.length, size);
  return items.slice(p * size, p * size + size);
}

/** Which page a given item is on. Not found (-1), the first page. */
export function pageOfIndex(index: number, size: number): number {
  if (index < 0 || size <= 0) return 0;
  return Math.floor(index / size);
}

/**
 * The previous and next buttons plus the `1 / 3 · 51 in total` display.
 *
 * **It disappears by itself when everything fits on one page** - so no useless buttons sit under a short table.
 */
export default function Pager({ page, total, size, onPage }: {
  page: number; total: number; size: number; onPage: (p: number) => void;
}) {
  const pages = pageCount(total, size);
  const cur = clampPage(page, total, size);
  if (total <= size) return null;
  const btn = "px-2 py-0.5 rounded border border-gray-300 dark:border-gray-700 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800";
  return (
    <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
      <button type="button" className={btn} disabled={cur <= 0} onClick={() => onPage(cur - 1)}>← 이전</button>
      <span>{cur + 1} / {pages}<span className="text-gray-400"> · 총 {total.toLocaleString()}건</span></span>
      <button type="button" className={btn} disabled={cur >= pages - 1} onClick={() => onPage(cur + 1)}>다음 →</button>
    </div>
  );
}
