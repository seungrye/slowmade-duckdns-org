import type { CalendarDay, EventKind } from './types';

/**
 * 특일 정보 API 응답 파서 (#328) — 순수. 네트워크를 모른다.
 *
 * ── 왜 이렇게 방어적인가 ────────────────────────────────────────────────
 *
 * 이 구현 시점에 서비스 키가 없어 **실제 응답을 확인하지 못했다.** 공공데이터포털 계열 API 는
 * 형식이 상황에 따라 흔들리는 것으로 알려져 있어, 알려진 변형을 모두 받아 둔다:
 *
 *   - 항목이 1건이면 `items.item` 이 배열이 아니라 **객체**로 온다
 *   - 0건이면 `items` 가 **빈 문자열**이거나 `item` 키가 없다
 *   - `locdate` 는 `20260101` 같은 **숫자**(문자열로 오는 경우도 있다)
 *
 * 형식이 실제와 다르면 **이 파일만** 고치면 된다.
 */

const OK = '00';
const LOCDATE = /^(\d{4})(\d{2})(\d{2})$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** `20260101` → `'2026-01-01'`. 못 읽으면 null. */
function toIsoDate(locdate: unknown): string | null {
  if (typeof locdate !== 'number' && typeof locdate !== 'string') return null;
  const m = LOCDATE.exec(String(locdate));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * 응답 하나를 `CalendarDay[]` 로. `kind` 는 어느 엔드포인트에서 온 것인지다.
 *
 * `resultCode` 가 정상이 아니면 **던진다** — 조용히 빈 배열을 돌려주면 호출측이 그걸로
 * 캐시를 덮어써서, 오류 한 번에 그 해 달력이 통째로 비어 버린다.
 */
export function parseSpecialDays(payload: unknown, kind: EventKind): CalendarDay[] {
  const root = asRecord(payload);
  const response = asRecord(root?.response);
  const header = asRecord(response?.header);
  if (!response || !header) {
    throw new Error('특일 정보 응답 형식이 아닙니다.');
  }
  if (header.resultCode !== OK) {
    throw new Error(`특일 정보 조회 실패: ${String(header.resultCode)} ${String(header.resultMsg ?? '')}`);
  }

  const items = asRecord(response.body)?.items;
  const raw = asRecord(items)?.item;
  if (raw === undefined || raw === null) return [];

  const list = Array.isArray(raw) ? raw : [raw];

  return list.flatMap((entry) => {
    const item = asRecord(entry);
    if (!item) return [];

    const date = toIsoDate(item.locdate);
    const name = typeof item.dateName === 'string' ? item.dateName.trim() : '';
    // 한 건이 깨졌다고 그 해 전체를 잃지 않는다.
    if (!date || !name) return [];

    // 공휴일 목록에 실렸는데 쉬는 날이 아니라고 표시된 것은 기념일로 낮춘다. 색 배지로
    // 띄우면 쉬는 날처럼 읽히기 때문이다.
    //
    // 실측(2026): `getRestDeInfo` 22건은 **전부 Y** 라 이 분기는 지금 걸리지 않는다. 해마다
    // 지정이 바뀌므로(제헌절도 예전엔 쉬지 않았다) 안전망으로 남겨 둔다.
    //
    // **공휴일 엔드포인트에만 적용한다.** 기념일·24절기 응답은 모든 항목이 `isHoliday: "N"`
    // 이라, 무조건 적용하면 24절기가 통째로 기념일이 되어 무게 구분이 무너진다.
    const resolved: EventKind = kind === 'holiday' && item.isHoliday === 'N' ? 'anniversary' : kind;

    return [{ date, name, kind: resolved }];
  });
}
