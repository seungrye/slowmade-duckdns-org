// #77 — 매매기록 upsert 가 전략 태그를 덮어쓰지 않는지.
//
// 배경: close-sync 는 마감마다 최근 100 건을 재푸시한다. 그런데 붙이는 전략이
// "그 거래가 난 전략"이 아니라 "포트폴리오에 지금 설정된 전략"이라, 전략을 바꾸면
// 과거 기록의 태그까지 전부 새 전략으로 덮였다(127 건 전부 infinite_v4 가 된 사고).
//
// 그래서 strategy 만은 최초 삽입 시에만 쓰고(=$setOnInsert), 이후 재푸시에서는
// 건드리지 않는다. 나머지 필드(가격·수량·누적)는 계속 갱신되어야 하므로 $set 에 둔다.
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

  // mongo 는 같은 필드가 $set 과 $setOnInsert 에 함께 있으면 에러를 낸다.
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

  // 전략이 비어 있으면 굳이 빈 값을 박아 두지 않는다(나중에 채울 여지를 남긴다).
  it('strategy 가 없으면 $setOnInsert 를 만들지 않는다', () => {
    const op = buildTradeUpsertOp(rec({ strategy: undefined }));
    expect(op.updateOne.update.$setOnInsert).toBeUndefined();
    expect(op.updateOne.update.$set).not.toHaveProperty('strategy');
  });
});

// #372 — 블록 귀속. strategy 와 달리 정정 가능해야 하지만, 모를 때 지우면 안 된다.
describe('buildTradeUpsertOp — portfolioId (#372)', () => {
  it('주인이 분명하면 $set 으로 간다 (정정 가능)', () => {
    const op = buildTradeUpsertOp(rec({ portfolioId: '6a96cf256e28c3f7746f65cc' }));
    // 값은 ObjectId 로 박힌다 (#384) — 문자열로 두면 조회가 한 건도 안 맞는다.
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

// #384 — 실측 재현. upsertTrades 는 StockTrade.collection.bulkWrite(원시 드라이버)를 쓴다.
//   거기엔 **mongoose 캐스팅이 없다** — 문자열을 주면 문자열로 박힌다.
//   ownerLookup 이 String(_id) 를 돌려주므로 그대로 넘어갔고, 마감 sync 가 돌면서
//   교정해 둔 ObjectId 148건을 문자열로 덮었다. 그 뒤 매매 상세가
//   `StockTrade.find({ portfolioId: "24hex" })` 로 조회하면 mongoose 가 **질의만** 캐스팅해
//   0건이 나온다 → "매매 종목 주가 데이터가 없습니다".
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
