// 매매기록 CSV 내보내기 (#181) — 순수 변환부. DB 도 요청도 모른다.
//
// 엑셀과 구글시트 양쪽에서 그대로 열리는 것이 목표다.

/**
 * UTF-8 BOM.
 *
 * 엑셀은 BOM 이 없으면 CSV 를 현재 코드페이지로 읽어 한글을 깨뜨린다(구글시트는 괜찮다).
 * 세 바이트로 두 프로그램을 다 만족시킬 수 있으니 늘 붙인다.
 */
export const CSV_BOM = '\ufeff';

export interface Column<T> {
  header: string;
  value: (row: T) => string | number | boolean | Date | null | undefined;
}

/** 셀 앞에 이게 오면 엑셀·시트가 **수식으로 실행한다**. 탭·CR 로 위장하는 변종까지 본다. */
const FORMULA_START = /^[\t\r\n ]*[=+\-@]/;

const KST = 'Asia/Seoul';

/** 날짜를 한국 시간 `YYYY-MM-DD HH:mm:ss` 로. 시간대를 안 박으면 서버 로캘에 따라 값이 흔들린다. */
function formatDate(d: Date): string {
  const p = new Intl.DateTimeFormat('sv-SE', {
    timeZone: KST,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(d);
  // sv-SE 는 `2026-08-18 10:23:45` 로 준다 — 그대로 쓴다.
  return p.replace('T', ' ');
}

/**
 * 값 하나를 CSV 한 칸으로.
 *
 * **수식 주입 차단**이 이 함수의 존재 이유다. 종목명·사유 같은 문자열이 그대로 셀에 들어가는데,
 * `=`·`+`·`-`·`@` 로 시작하면 파일을 여는 순간 수식으로 실행된다(`=HYPERLINK(...)` 로 다른 셀
 * 내용을 외부로 실어 보내는 것이 고전적인 수법이다). 앞에 작은따옴표를 붙여 글자로 고정한다.
 *
 * **숫자는 건드리지 않는다** — 음수 손익까지 글자로 바꾸면 시트에서 합계가 깨진다. 위험한 건
 * 어차피 문자열로 들어온 값이다.
 */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? '예' : '아니오';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : formatDate(v);

  let s = String(v);
  if (FORMULA_START.test(s)) s = `'${s}`;
  // 쉼표·따옴표·줄바꿈이 있으면 감싼다. 감쌌으면 안쪽 따옴표는 두 번 쓴다.
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * 행들을 CSV 문자열로. 행이 없어도 **머리글은 남긴다** — 빈 파일을 받으면 자료가 없는 건지
 * 내보내기가 실패한 건지 구분할 수 없다.
 *
 * 줄 끝은 CRLF(엑셀이 기대하는 형식).
 */
export function toCsv<T>(rows: T[], columns: Column<T>[]): string {
  const head = columns.map((c) => csvCell(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(','));
  return CSV_BOM + [head, ...body].join('\r\n') + '\r\n';
}
