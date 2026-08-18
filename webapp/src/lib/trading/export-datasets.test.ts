// 내보낼 4종 데이터셋 정의 (#181).
//
// 컬럼 정의는 순수하다 — DB 없이 검증한다. 라우트는 문서만 읽어와 여기에 넘긴다.
import { describe, it, expect } from 'vitest';
import { DATASETS, datasetById, exportFileName, type DatasetId } from './export-datasets';
import { toCsv, CSV_BOM } from './export-csv';

const IDS: DatasetId[] = ['orders', 'portfolio', 'runs', 'trades'];

describe('DATASETS', () => {
  it('네 가지를 모두 내보낸다', () => {
    expect(DATASETS.map((d) => d.id).sort()).toEqual([...IDS].sort());
  });

  it.each(IDS)('%s 는 한글 이름과 컬럼을 갖는다', (id) => {
    const d = datasetById(id)!;
    expect(d.label.length).toBeGreaterThan(0);
    expect(d.columns.length).toBeGreaterThan(0);
    expect(d.columns.every((c) => c.header.length > 0)).toBe(true);
  });

  it('모르는 id 는 undefined — 라우트가 400 으로 끊는다', () => {
    expect(datasetById('../../etc/passwd')).toBeUndefined();
    expect(datasetById('')).toBeUndefined();
  });
});

describe('주문 로그 — 흔히 말하는 매매기록', () => {
  const d = datasetById('orders')!;
  const row = {
    createdAt: new Date('2026-08-18T01:23:45.000Z'),
    envKey: 'paper-50194613', market: 'us', strategy: 'infinite_v4',
    symbol: 'TQQQ', side: 'buy', qty: 3, price: 71.25,
    ordType: 'market', reason: '1회차 진입', dryRun: false, orderNo: 'A123',
  };

  it('사람이 읽는 머리글', () => {
    expect(d.columns.map((c) => c.header)).toEqual([
      '시각', '계정', '시장', '전략', '종목', '방향', '수량', '가격', '주문유형', '사유', '모의', '주문번호',
    ]);
  });

  it('값이 그대로 실린다', () => {
    const line = toCsv([row], d.columns).replace(CSV_BOM, '').trim().split('\r\n')[1];
    expect(line).toBe('2026-08-18 10:23:45,paper-50194613,us,infinite_v4,TQQQ,buy,3,71.25,market,1회차 진입,아니오,A123');
  });

  it('빠진 필드가 있어도 터지지 않는다 — 옛 문서엔 없는 값이 있다', () => {
    expect(() => toCsv([{ symbol: 'X' }], d.columns)).not.toThrow();
  });
});

describe('포트폴리오 이력 — 수익률 계산용', () => {
  const d = datasetById('portfolio')!;
  it('손익 컬럼이 있다', () => {
    const h = d.columns.map((c) => c.header);
    expect(h).toContain('당일손익');
    expect(h).toContain('누적손익');
    expect(h).toContain('총평가');
  });

  it('음수 손익이 숫자로 남는다 — 시트에서 합계가 돼야 한다', () => {
    const line = toCsv([{ dateStr: '2026-08-17', runPnl: -1500, cumulativePnl: -2300 }], d.columns)
      .replace(CSV_BOM, '').trim().split('\r\n')[1];
    expect(line).toContain('-1500');
    expect(line).toContain('-2300');
    expect(line).not.toContain("'-1500");
  });
});

describe('숨김 행', () => {
  // 내보내기가 조용히 빠뜨리면 합계가 안 맞는데 이유를 알 수 없다. 빼지 말고 표시한다.
  it.each(['portfolio', 'trades'] as DatasetId[])('%s 는 숨김 여부를 컬럼으로 남긴다', (id) => {
    expect(datasetById(id)!.columns.map((c) => c.header)).toContain('숨김');
  });
});

describe('exportFileName', () => {
  it('무엇을 언제 뽑았는지 이름만 봐도 안다', () => {
    expect(exportFileName('orders', new Date('2026-08-18T01:23:45.000Z'))).toBe('매매기록-주문로그-20260818.csv');
  });

  it('한국 날짜 기준 — UTC 로 자정을 넘긴 시각도 그날로 본다', () => {
    // 2026-08-17T23:00Z = KST 8/18 08:00
    expect(exportFileName('orders', new Date('2026-08-17T23:00:00.000Z'))).toContain('20260818');
  });

  it('데이터셋마다 이름이 다르다', () => {
    const at = new Date('2026-08-18T01:00:00.000Z');
    const names = IDS.map((id) => exportFileName(id, at));
    expect(new Set(names).size).toBe(IDS.length);
  });
});
