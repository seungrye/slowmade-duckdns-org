import type { CalendarDay, EventKind } from './types';

/**
 * The special-days API response parser (#328) - pure. It knows nothing of the network.
 *
 * ── Why it is this defensive ────────────────────────────────────────────
 *
 * There was no service key when this was written, so **the real response could not be checked.** APIs on the public
 * data portal are known to vary their shape by circumstance, so every known variant is accepted:
 *
 *   - with one item, `items.item` arrives as **an object** rather than an array
 *   - with none, `items` is **an empty string** or the `item` key is absent
 *   - `locdate` is **a number** like `20260101` (sometimes a string)
 *
 * If the shape turns out to differ, **only this file** needs fixing.
 */

const OK = '00';
const LOCDATE = /^(\d{4})(\d{2})(\d{2})$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** `20260101` -> `'2026-01-01'`. null when unreadable. */
function toIsoDate(locdate: unknown): string | null {
  if (typeof locdate !== 'number' && typeof locdate !== 'string') return null;
  const m = LOCDATE.exec(String(locdate));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * One response into `CalendarDay[]`. `kind` says which endpoint it came from.
 *
 * A non-OK `resultCode` **throws** - quietly returning an empty array would have the caller overwrite the cache with
 * it, emptying that whole year's calendar over a single error.
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
    // One broken item does not cost the whole year.
    if (!date || !name) return [];

    // Something listed as a holiday but marked as not a day off is demoted to an observance, because showing it as a
    // coloured badge reads as a day off.
    //
    // Measured (2026): all 22 from `getRestDeInfo` are **Y**, so this branch never fires today. Designations change
    // yearly (Constitution Day was not a day off once), so it stays as a safety net.
    //
    // **Applied to the holiday endpoint only.** Every item in the observance and solar-term responses has
    // `isHoliday: "N"`, so applying it unconditionally would turn all 24 solar terms into observances and collapse the weighting.
    const resolved: EventKind = kind === 'holiday' && item.isHoliday === 'N' ? 'anniversary' : kind;

    return [{ date, name, kind: resolved }];
  });
}
