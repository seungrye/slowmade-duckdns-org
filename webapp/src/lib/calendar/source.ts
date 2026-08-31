import { env } from '@/lib/env';
import { parseSpecialDays } from './parse';
import type { CalendarDay, EventKind } from './types';

/**
 * 특일 정보 수집 (#328) — **네트워크를 아는 유일한 파일**.
 *
 * 공공데이터포털 한국천문연구원 특일 정보. 세 엔드포인트를 연 단위로 받아 합친다.
 * 파싱은 `parse.ts`(순수)가 하고 여기는 호출과 조립만 한다.
 */

const BASE = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService';

const ENDPOINTS: { path: string; kind: EventKind }[] = [
  { path: 'getRestDeInfo', kind: 'holiday' }, // 국경일·공휴일
  { path: 'getAnniversaryInfo', kind: 'anniversary' }, // 기념일
  { path: 'get24DivisionsInfo', kind: 'season' }, // 24절기
];

// 한 해 항목 수는 엔드포인트별로 많아야 수십 건이지만, 페이지가 잘리면 그 해가 조용히
// 비므로 넉넉히 한 번에 받는다.
const NUM_OF_ROWS = 100;

/**
 * 공공데이터포털은 서비스 키를 **두 가지 형태**로 준다.
 *
 *   Encoding(인코딩)  이미 `%2F` 처럼 인코딩된 문자열
 *   Decoding(일반 인증키)  `+` `/` `=` 가 그대로 들어 있는 원본
 *
 * 어느 쪽을 넣어도 되게 한다. 원본을 그냥 붙이면 `+` 가 공백으로 해석돼 401 이 나고,
 * 인코딩된 것을 또 인코딩하면 `%` 가 `%25` 가 되어 역시 401 이 난다. `%` 가 있으면
 * 이미 인코딩된 것으로 본다.
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

/** 한 해치 특일을 모두 받아 합친다. 키가 없으면 빈 배열(기능 off). */
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
      // 오류 시 XML/HTML 이 오기도 한다. json() 이 던지면 그대로 위로 올린다.
      return parseSpecialDays(await res.json(), kind);
    })
  );

  return results.flat();
}
