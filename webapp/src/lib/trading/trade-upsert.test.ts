// #77 - whether a trade-record upsert overwrites the strategy tag.
//
// Background: close-sync re-pushes the most recent 100 records at every close. But the strategy it attached was
// "the strategy configured on the portfolio right now", not "the strategy that made the trade", so switching
// strategies overwrote the tags on past records too (the incident where all 127 became infinite_v4).
//
// So strategy alone is written only on first insert (= $setOnInsert) and left alone on later re-pushes.
// The other fields (price, quantity, cumulative) must keep updating, so they stay in $set.
import { describe, it, expect } from 'vitest';
import { buildTradeUpsertOp } from './trade-upsert';
import { Types } from 'mongoose';

const rec = (over: Record<string, unknown> = {}) => ({
  env: 'paper-50194613',
  ticker: 'SOXL',
  action: 'buy',
  strategy: 'rotation_v1',
  qty: 5,
  cumulativeQty: 663,
  price: 154,
  amount: 770,
  currency: 'USD',
  date: '2026-07-22',
  time: '2026-07-22T22:35:51',
  ...over,
});

describe('buildTradeUpsertOp', () => {
  it('strategy 는 $setOnInsert 로 간다 — 재푸시가 기존 태그를 덮으면 안 된다', () => {
    const op = buildTradeUpsertOp(rec());
    expect(op.updateOne.update.$setOnInsert).toEqual({ strategy: 'rotation_v1' });
    expect(op.updateOne.update.$set).not.toHaveProperty('strategy');
  });

  it('나머지 필드는 $set 으로 계속 갱신된다', () => {
    const op = buildTradeUpsertOp(rec({ price: 155, cumulativeQty: 700 }));
    expect(op.updateOne.update.$set).toMatchObject({
      ticker: 'SOXL', action: 'buy', qty: 5, price: 155, cumulativeQty: 700, currency: 'USD',
    });
  });

  // mongo errors when the same field appears in both $set and $setOnInsert.
  it('$set 과 $setOnInsert 의 키가 겹치지 않는다', () => {
    const op = buildTradeUpsertOp(rec());
    const a = Object.keys(op.updateOne.update.$set);
    const b = Object.keys(op.updateOne.update.$setOnInsert ?? {});
    expect(a.filter((k) => b.includes(k))).toEqual([]);
  });

  it('필터는 env+ticker+정규화된 time 이고 upsert 다', () => {
    const op = buildTradeUpsertOp(rec());
    expect(op.updateOne.filter).toEqual({
      env: 'paper-50194613', ticker: 'SOXL', time: expect.anything(),
    });
    expect(op.updateOne.upsert).toBe(true);
  });

  it('time 은 정규화된 값이 filter 와 $set 에 같이 쓰인다', () => {
    const op = buildTradeUpsertOp(rec());
    expect(op.updateOne.update.$set.time).toEqual(op.updateOne.filter.time);
  });

  // With no strategy, an empty value is not written (leaving room to fill it in later).
  it('strategy 가 없으면 $setOnInsert 를 만들지 않는다', () => {
    const op = buildTradeUpsertOp(rec({ strategy: undefined }));
    expect(op.updateOne.update.$setOnInsert).toBeUndefined();
    expect(op.updateOne.update.$set).not.toHaveProperty('strategy');
  });
});

// #372 - block attribution. Unlike strategy it must be correctable, but it must not be erased when unknown.
describe('buildTradeUpsertOp — portfolioId (#372)', () => {
  it('주인이 분명하면 $set 으로 간다 (정정 가능)', () => {
    const op = buildTradeUpsertOp(rec({ portfolioId: '6a96cf256e28c3f7746f65cc' }));
    // The value is written as an ObjectId (#384) - as a string, not a single query matches.
    expect(String(op.updateOne.update.$set.portfolioId)).toBe('6a96cf256e28c3f7746f65cc');
  });

  it('주인을 모르면 아예 손대지 않는다 — 교정해 둔 귀속이 지워지면 안 된다', () => {
    for (const v of [undefined, null]) {
      const op = buildTradeUpsertOp(rec({ portfolioId: v }));
      expect(op.updateOne.update.$set).not.toHaveProperty('portfolioId');
      expect(op.updateOne.update.$setOnInsert ?? {}).not.toHaveProperty('portfolioId');
    }
  });

  it('portfolioId 가 $setOnInsert 와 겹치지 않는다', () => {
    const op = buildTradeUpsertOp(rec({ portfolioId: 'x' }));
    const a = Object.keys(op.updateOne.update.$set);
    const b = Object.keys(op.updateOne.update.$setOnInsert ?? {});
    expect(a.filter((k) => b.includes(k))).toEqual([]);
  });
});

// #384 - reproducing what was measured. upsertTrades uses StockTrade.collection.bulkWrite (the raw driver).
//   There is **no mongoose casting there** - give it a string and a string is what gets written.
//   ownerLookup returned String(_id), so that is what went through, and the close sync overwrote 148
//   corrected ObjectIds with strings. After that, the trade detail page querying
//   `StockTrade.find({ portfolioId: "24hex" })` gets 0 rows, because mongoose casts **only the query**
//   -> "there is no price data for the traded symbols".
describe('buildTradeUpsertOp — portfolioId 타입 (#384)', () => {
  it('24자리 hex 는 ObjectId 로 박는다 — 원시 드라이버는 캐스팅해 주지 않는다', () => {
    const op = buildTradeUpsertOp(rec({ portfolioId: '6a5a1a98b1b5dac7f7583ccf' }));
    const pid = op.updateOne.update.$set.portfolioId as { _bsontype?: string };
    expect(typeof pid).not.toBe('string');
    expect(String(pid)).toBe('6a5a1a98b1b5dac7f7583ccf');
  });

  it('이미 ObjectId 면 그대로 둔다', () => {
    const oid = new Types.ObjectId('6a96cf256e28c3f7746f65cc');
    const op = buildTradeUpsertOp(rec({ portfolioId: oid }));
    expect(String(op.updateOne.update.$set.portfolioId)).toBe('6a96cf256e28c3f7746f65cc');
  });

  it('ObjectId 로 볼 수 없는 값은 손대지 않는다 — 조용히 바꿔치기하지 않는다', () => {
    const op = buildTradeUpsertOp(rec({ portfolioId: 'not-an-object-id' }));
    expect(op.updateOne.update.$set.portfolioId).toBe('not-an-object-id');
  });
});
