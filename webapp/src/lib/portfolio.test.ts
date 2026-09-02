import { describe, it, expect } from 'vitest';
import { dedupeHistory, aggregateTradesByDate, splitTradesByBlock, groupBlocks } from './portfolio';

describe('dedupeHistory', () => {
  it('같은 dateStr 은 마지막(가장 늦게 온) record 만 남긴다', () => {
    const docs = [
      { dateStr: '2026-06-01', totalValue: 100, cash: 10, holdingsValue: 90, cumulativePnl: 5 },
      { dateStr: '2026-06-01', totalValue: 200, cash: 20, holdingsValue: 180, cumulativePnl: 10 },
      { dateStr: '2026-06-02', totalValue: 300, cash: 30, holdingsValue: 270, cumulativePnl: 15 },
    ];
    const r = dedupeHistory(docs);
    expect(r.length).toBe(2);
    expect(r[0]).toEqual({ dateStr: '2026-06-01', totalValue: 200, cash: 20, holdingsValue: 180, cumulativePnl: 10 });
    expect(r[1].totalValue).toBe(300);
  });

  it('빈 입력은 빈 배열', () => {
    expect(dedupeHistory([])).toEqual([]);
  });
});

describe('aggregateTradesByDate', () => {
  it('날짜별 buy/sell 건수·금액·티커(중복 제거)를 집계한다', () => {
    const trades = [
      { date: '2026-06-01', action: 'buy', ticker: 'AAPL', amount: 100 },
      { date: '2026-06-01', action: 'buy', ticker: 'AAPL', amount: 50 }, // 같은 티커 → tickers 중복 안 함
      { date: '2026-06-01', action: 'sell', ticker: 'TSLA', price: 10, qty: 5 }, // amount 없음 → price*qty
    ];
    const r = aggregateTradesByDate(trades);
    expect(r['2026-06-01'].buy).toBe(2);
    expect(r['2026-06-01'].buyAmount).toBe(150);
    expect(r['2026-06-01'].buyTickers).toEqual(['AAPL']);
    expect(r['2026-06-01'].sell).toBe(1);
    expect(r['2026-06-01'].sellAmount).toBe(50); // 10 * 5
    expect(r['2026-06-01'].sellTickers).toEqual(['TSLA']);
  });

  it('여러 날짜를 각각 분리 집계한다', () => {
    const trades = [
      { date: '2026-06-01', action: 'buy', ticker: 'A', amount: 10 },
      { date: '2026-06-02', action: 'sell', ticker: 'B', amount: 20 },
    ];
    const r = aggregateTradesByDate(trades);
    expect(Object.keys(r).sort()).toEqual(['2026-06-01', '2026-06-02']);
    expect(r['2026-06-01'].buy).toBe(1);
    expect(r['2026-06-02'].sell).toBe(1);
  });

  it('빈 입력은 빈 객체', () => {
    expect(aggregateTradesByDate([])).toEqual({});
  });
});

// #373 — 매매를 블록별로 가른다. 마커를 블록 선 위에 찍으려면 필요하고,
// 주인 없는 매매(폐기된 전략의 기록)를 버리면 그 시절 매매가 차트에서 사라진다.
describe('splitTradesByBlock', () => {
  const t = (over: Record<string, unknown> = {}) => ({
    ticker: 'TQQQ', action: 'buy', qty: 1, price: 50, amount: 50, date: '2026-08-10', ...over,
  });

  it('귀속된 것은 블록별로, 안 된 것은 따로 모은다', () => {
    const { byBlock, unowned } = splitTradesByBlock([
      t({ portfolioId: 'v4' }),
      t({ portfolioId: 'vr', ticker: 'SOXL' }),
      t({ ticker: 'OKE' }),
    ]);
    expect(Object.keys(byBlock).sort()).toEqual(['v4', 'vr']);
    expect(byBlock.v4).toHaveLength(1);
    expect(unowned.map((x) => x.ticker)).toEqual(['OKE']);
  });

  it('주인 없는 매매를 버리지 않는다 — 폐기된 전략의 기록도 실제 매매다', () => {
    const { unowned } = splitTradesByBlock([t({ ticker: 'OKE' }), t({ ticker: 'KMI' })]);
    expect(unowned).toHaveLength(2);
  });

  it('ObjectId 처럼 객체로 와도 문자열 키로 묶인다', () => {
    const oid = { toString: () => 'abc123' };
    const { byBlock } = splitTradesByBlock([t({ portfolioId: oid }), t({ portfolioId: oid })]);
    expect(byBlock.abc123).toHaveLength(2);
  });

  it('빈 배열이면 둘 다 비어 있다', () => {
    expect(splitTradesByBlock([])).toEqual({ byBlock: {}, unowned: [] });
  });
});

describe('groupBlocks — 블록별 매매 집계 (#373)', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    dateStr: '2026-08-10', totalValue: 100, cash: 0, holdingsValue: 100, cumulativePnl: 0,
    portfolioId: 'v4', strategy: 'infinite_v4', ...over,
  });

  it('그 블록 매매만 실어 준다', () => {
    const blocks = groupBlocks(
      [row(), row({ portfolioId: 'vr', strategy: 'value_rebalancing' })],
      { v4: { '2026-08-10': { buy: 3, sell: 0, buyAmount: 30, sellAmount: 0, buyTickers: ['TQQQ'], sellTickers: [] } } },
    );
    const v4 = blocks.find((b) => b.portfolioId === 'v4')!;
    expect(v4.tradesByDate['2026-08-10'].buy).toBe(3);
    expect(blocks.find((b) => b.portfolioId === 'vr')!.tradesByDate).toEqual({});
  });

  it('백필 행에 전략이 비어 있어도 라이브 행의 전략을 쓴다', () => {
    const blocks = groupBlocks([
      row({ dateStr: '2026-08-10', strategy: '' }),
      row({ dateStr: '2026-08-11' }),
    ]);
    expect(blocks[0].strategy).toBe('infinite_v4');
  });
});
