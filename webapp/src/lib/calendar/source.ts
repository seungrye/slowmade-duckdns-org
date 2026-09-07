import { env } from '@/lib/env';
import { parseSpecialDays } from './parse';
import type { CalendarDay, EventKind } from './types';

/**
 * Special-days collection (#328) - **the only file that knows the network**.
 *
 * The Korea Astronomy and Space Science Institute's special-days data on the public data portal. Three endpoints are
 * fetched per year and merged. Parsing is `parse.ts` (pure); this file only calls and assembles.
 */

const BASE = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService';

const ENDPOINTS: { path: string; kind: EventKind }[] = [
  { path: 'getRestDeInfo', kind: 'holiday' }, // 국경일·공휴일
  { path: 'getAnniversaryInfo', kind: 'anniversary' }, // 기념일
  { path: 'get24DivisionsInfo', kind: 'season' }, // 24절기
];

// Measured for 2026: 22 holidays, 82 observances, 24 solar terms. Observances are close to 100, so the page size is
// generous - a truncated page would simply lose part of that year.
const NUM_OF_ROWS = 300;

/**
 * The public data portal issues service keys in **two forms**.
 *
 *   Encoding  an already-encoded string, with `%2F` and the like
 *   Decoding  the raw one, still containing `+`, `/` and `=`
 *
 * Either is accepted. Pasting the raw one directly makes `+` read as a space and returns 401, while encoding an
 * already-encoded one turns `%` into `%25` and also returns 401. A `%` present means it is already encoded.
 */
function encodedKey(key: string): string {
  return key.includes('%') ? key : encodeURIComponent(key);
}

function urlFor(path: string, year: number): string {
  const params = new URLSearchParams({
    solYear: String(year),
    numOfRows: String(NUM_OF_ROWS),
    pageNo: '1',
    _type: 'json',
  });
  return `${BASE}/${path}?${params.toString()}&serviceKey=${encodedKey(env.holidayApiKey)}`;
}

/** Fetches and merges a whole year of special days. With no key it returns an empty array (the feature is off). */
export async function fetchSpecialDays(year: number): Promise<CalendarDay[]> {
  if (!env.holidayApiKey) return [];

  const results = await Promise.all(
    ENDPOINTS.map(async ({ path, kind }) => {
      const res = await fetch(urlFor(path, year), {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error(`특일 정보 ${path} 응답 ${res.status}`);
      }
      // Errors sometimes arrive as XML or HTML. If json() throws, it propagates.
      return parseSpecialDays(await res.json(), kind);
    })
  );

  return results.flat();
}
