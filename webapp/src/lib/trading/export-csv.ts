// Trade-record CSV export (#181) - the pure conversion. It knows nothing of the DB or the request.
//
// The goal is a file that opens as is in both Excel and Google Sheets.

/**
 * UTF-8 BOM.
 *
 * Without a BOM, Excel reads the CSV in the current code page and mangles Korean (Sheets is fine).
 * Three bytes satisfy both programs, so it is always added.
 */
export const CSV_BOM = '\ufeff';

export interface Column<T> {
  header: string;
  value: (row: T) => string | number | boolean | Date | null | undefined;
}

/** A cell starting with one of these is **executed as a formula** by Excel and Sheets. Tab- and CR-disguised variants count too. */
const FORMULA_START = /^[\t\r\n ]*[=+\-@]/;

const KST = 'Asia/Seoul';

/** Formats a date as `YYYY-MM-DD HH:mm:ss` in Korean time. Without pinning the zone the value drifts with the server locale. */
function formatDate(d: Date): string {
  const p = new Intl.DateTimeFormat('sv-SE', {
    timeZone: KST,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(d);
  // sv-SE gives `2026-08-18 10:23:45`, which is used as is.
  return p.replace('T', ' ');
}

/**
 * One value into one CSV cell.
 *
 * **Blocking formula injection** is why this function exists. Strings like symbol names and reasons land in
 * cells verbatim, and one starting with `=`, `+`, `-` or `@` runs as a formula the moment the file is opened
 * (`=HYPERLINK(...)` smuggling another cell's contents outward is the classic trick). A leading apostrophe
 * pins it as text.
 *
 * **Numbers are left alone** - turning a negative P&L into text breaks the sheet's totals. What is dangerous
 * arrived as a string anyway.
 */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? '예' : '아니오';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : formatDate(v);

  let s = String(v);
  if (FORMULA_START.test(s)) s = `'${s}`;
  // Wrap when there is a comma, quote or newline. Once wrapped, inner quotes are doubled.
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Rows into a CSV string. **The header stays even with no rows** - given an empty file you cannot tell
 * whether there was no data or the export failed.
 *
 * Lines end with CRLF (what Excel expects).
 */
export function toCsv<T>(rows: T[], columns: Column<T>[]): string {
  const head = columns.map((c) => csvCell(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(','));
  return CSV_BOM + [head, ...body].join('\r\n') + '\r\n';
}
