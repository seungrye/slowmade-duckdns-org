import { describe, it, expect } from 'vitest';
import { dedupeHistory, aggregateTradesByDate } from './portfolio';

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
