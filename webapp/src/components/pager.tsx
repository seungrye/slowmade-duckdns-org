// 표 페이저 (#184).
//
// `admin/trading/monitor` 안에만 있던 것을 꺼내 공용으로 옮겼다 — 매매 상세 화면의 두 표도
// 같은 모양이 필요해서다. 컴포넌트 동작은 옮기기 전과 같다.
//
// 계산은 밖으로 빼 두었다. 페이징에서 사고가 나는 자리는 거의 언제나 **경계**(0건, 정확히
// 나누어떨어질 때, 범위를 벗어난 page)인데, 순수 함수라야 그 경우를 다 찔러 볼 수 있다.

/** 전체 페이지 수. 0건이어도 1 — `0 / 0` 같은 표시가 나오지 않게. */
export function pageCount(total: number, size: number): number {
  if (size <= 0) return 1;
  return Math.max(1, Math.ceil(total / size));
}

/**
 * page 를 유효 범위로 당긴다.
 *
 * 자료가 줄어들면(필터를 바꾸는 등) 들고 있던 page 가 범위를 벗어난다. 그대로 두면
 * 빈 표가 뜬다.
 */
export function clampPage(page: number, total: number, size: number): number {
  return Math.min(Math.max(0, page), pageCount(total, size) - 1);
}

/** 해당 페이지의 항목들. 범위를 벗어난 page 는 마지막 페이지로 본다. */
export function pageSlice<T>(items: T[], page: number, size: number): T[] {
  if (size <= 0) return items;
  const p = clampPage(page, items.length, size);
  return items.slice(p * size, p * size + size);
}

/** 몇 번째 항목이 몇 페이지에 있나. 못 찾았을 때(-1)는 첫 페이지. */
export function pageOfIndex(index: number, size: number): number {
  if (index < 0 || size <= 0) return 0;
  return Math.floor(index / size);
}

/**
 * 이전/다음 버튼과 `1 / 3 · 총 51건` 표시.
 *
 * **한 페이지에 다 들어가면 스스로 사라진다** — 짧은 표 아래에 쓸모없는 버튼이 남지 않게.
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
