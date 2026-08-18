// 구글 시트로 내보내기 (#181 2단계) — 값 변환부.
//
// CSV 와 결정적으로 다른 점: **숫자를 숫자로 보낸다.** 시트에서 `SUM` 이 그대로 먹어야 한다.
// 그리고 `valueInputOption=RAW` 로 쓰기 때문에 시트가 값을 수식으로 해석하지 않는다 —
// CSV 에서 작은따옴표로 막았던 수식 주입이 여기선 API 옵션으로 끝난다. 그래서 여기서는
// **값을 훼손하지 않는 것**이 오히려 규칙이다.
import { describe, it, expect } from 'vitest';
import { toSheetValues, spreadsheetTitle, tabTitle } from './sheets';
import { DATASETS, datasetById } from '@/lib/trading/export-datasets';
import type { Column } from '@/lib/trading/export-csv';

interface Row { name: string; qty: number; pnl: number; ok: boolean; when: Date; note?: string | null }

const COLS: Column<Row>[] = [
  { header: '이름', value: (r) => r.name },
  { header: '수량', value: (r) => r.qty },
  { header: '손익', value: (r) => r.pnl },
  { header: '여부', value: (r) => r.ok },
  { header: '시각', value: (r) => r.when },
  { header: '비고', value: (r) => r.note },
];

const row = (o: Partial<Row> = {}): Row => ({
  name: 'TQQQ', qty: 3, pnl: -1500, ok: true,
  when: new Date('2026-08-18T01:23:45.000Z'), ...o,
});

describe('toSheetValues', () => {
  it('첫 줄은 머리글', () => {
    expect(toSheetValues([], COLS)[0]).toEqual(['이름', '수량', '손익', '여부', '시각', '비고']);
  });

  it('행이 없어도 머리글은 남긴다 — 빈 탭이 실패인지 자료 없음인지 구분되게', () => {
    expect(toSheetValues([], COLS)).toHaveLength(1);
  });

  // 이게 CSV 와 갈리는 지점이다.
  it('숫자는 숫자 타입 그대로 — 시트에서 합계가 돼야 한다', () => {
    const [, first] = toSheetValues([row()], COLS);
    expect(first[1]).toBe(3);
    expect(typeof first[1]).toBe('number');
    expect(first[2]).toBe(-1500);
    expect(typeof first[2]).toBe('number');
  });

  it('불리언은 사람이 읽는 말로', () => {
    expect(toSheetValues([row({ ok: false })], COLS)[1][3]).toBe('아니오');
  });

  it('날짜는 한국시간 문자열', () => {
    expect(toSheetValues([row()], COLS)[1][4]).toBe('2026-08-18 10:23:45');
  });

  it('빈 값은 빈 칸 — null 을 글자로 흘리지 않는다', () => {
    expect(toSheetValues([row({ note: null })], COLS)[1][5]).toBe('');
  });

  // RAW 로 쓰므로 시트가 수식으로 해석하지 않는다. 값을 건드릴 이유가 없다.
  it('수식처럼 보이는 문자열도 그대로 둔다 — RAW 쓰기라 실행되지 않는다', () => {
    const v = toSheetValues([row({ note: '=SUM(A1:A9)' })], COLS)[1][5];
    expect(v).toBe('=SUM(A1:A9)');
    expect(v).not.toContain("'");
  });

  it('행 순서를 지킨다', () => {
    const vals = toSheetValues([row({ name: 'A' }), row({ name: 'B' })], COLS);
    expect(vals.map((r) => r[0])).toEqual(['이름', 'A', 'B']);
  });

  it('컬럼이 없는 옛 문서도 터지지 않는다', () => {
    const d = datasetById('orders')!;
    expect(() => toSheetValues([{ symbol: 'X' }], d.columns)).not.toThrow();
  });
});

describe('시트·탭 이름', () => {
  it('시트 이름에 날짜가 들어간다 — 언제 뽑았는지 알게', () => {
    expect(spreadsheetTitle(new Date('2026-08-18T01:00:00.000Z'))).toBe('매매기록 2026-08-18');
  });

  it('한국 날짜 기준 — UTC 로 자정을 넘긴 시각도 그날로', () => {
    expect(spreadsheetTitle(new Date('2026-08-17T23:00:00.000Z'))).toContain('2026-08-18');
  });

  it('탭 이름은 데이터셋 이름 그대로', () => {
    expect(tabTitle('orders')).toBe('주문로그');
  });

  it('네 데이터셋의 탭 이름이 서로 다르다 — 시트 안에서 겹치면 안 된다', () => {
    const names = DATASETS.map((d) => tabTitle(d.id));
    expect(new Set(names).size).toBe(DATASETS.length);
  });
});
