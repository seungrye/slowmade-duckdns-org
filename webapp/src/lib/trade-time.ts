/**
 * Normalising the `time` in the trade-record idempotency key - truncated to the second.
 *
 * The same fill arrived with a different `time` format depending on the path that recorded it:
 *   - the Python site_sync (historical): microseconds  `...T22:41:00.027475`
 *   - recordChartTrade at order time (removed): JS milliseconds with a Z `...T13:44:11.257Z`
 *   - the site's close-sync (the current canonical): seconds `...T22:41:00`
 *
 * The ingest idempotency key is an exact string match on `{env, ticker, time}`, so a differing fraction stored the
 * same fill twice as separate records. Aligning to the second prevents that recurring.
 * (KIS fill times have second resolution, so truncating to the second loses nothing.)
 */
export function normalizeTradeTime(t: string): string {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/.exec(t);
  return m ? m[1] : t;
}
