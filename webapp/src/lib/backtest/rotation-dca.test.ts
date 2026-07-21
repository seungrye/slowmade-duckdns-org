import { describe, it, expect } from "vitest";
import { runRotationBacktest } from "./rotation";
import type { Bar } from "./types";

// 로테이션 분할매수(DCA) — 진입/교체 시 현금 전액을 한 번에 사는 대신 dcaSlices 거래일에 나눠 매수.
const D = (i: number) => `2020-01-${String(i + 1).padStart(2, "0")}`;
const mk = (closes: number[]): Bar[] =>
  closes.map((c, i) => ({ date: D(i), open: c, high: c, low: c, close: c }));

// 시그널 SMA3 위(레짐 온), 후보 1종(항상 1위), 재평가 주기 크게(중간 교체 없음).
const BASE = { principal: 10000, smaPeriod: 3, bandPct: 0, momDays: 2, rebalanceDays: 10 };

describe("rotation DCA — 대조군(일시금) 불변", () => {
  it("dcaSlices 미지정이면 진입 시 현금 전액 1회 매수(기존과 동일)", () => {
    const signal = mk([10, 10, 10, 12, 13, 14, 15, 16]);
    const A = mk([100, 100, 100, 100, 100, 100, 100, 100]);
    const r = runRotationBacktest([{ ticker: "A", bars: A }], signal, BASE);
    const buys = r.trades.filter((t) => t.side === "buy");
    expect(buys).toHaveLength(1);
    expect(buys[0].qty).toBe(100); // floor(10000/100) 전액
  });

  it("dcaSlices<=1 도 일시금(가드)", () => {
    const signal = mk([10, 10, 10, 12, 13, 14, 15, 16]);
    const A = mk([100, 100, 100, 100, 100, 100, 100, 100]);
    const r = runRotationBacktest([{ ticker: "A", bars: A }], signal, { ...BASE, dcaSlices: 1 });
    expect(r.trades.filter((t) => t.side === "buy")).toHaveLength(1);
  });
});

describe("rotation DCA — 분할매수 동작", () => {
  it("dcaSlices=4 면 진입 후 4거래일에 걸쳐 1/4씩 매수(평단 누적)", () => {
    const signal = mk([10, 10, 10, 12, 13, 14, 15, 16]); // d4(idx3)부터 레짐 온
    const A = mk([100, 100, 100, 100, 100, 100, 100, 100]);
    const r = runRotationBacktest([{ ticker: "A", bars: A }], signal, { ...BASE, dcaSlices: 4 });
    const buys = r.trades.filter((t) => t.side === "buy");
    expect(buys).toHaveLength(4); // 4 슬라이스
    expect(buys.every((b) => b.qty === 25)).toBe(true); // 각 floor(2500/100)=25
    expect(buys.map((b) => b.date)).toEqual([D(3), D(4), D(5), D(6)]); // 연속 4거래일
    // 최종 보유 = 100주(전액), 첫날 노출은 1/4
    const totalQty = buys.reduce((s, b) => s + b.qty, 0);
    expect(totalQty).toBe(100);
    expect(buys[0].qty).toBe(100 / 4);
  });

  it("레짐 오프면 남은 슬라이스 취소하고 전량 청산", () => {
    // d4,d5 레짐 온(슬라이스 2회) → d6 급락 레짐 오프 → 청산·취소
    const signal = mk([10, 10, 10, 12, 13, 3, 3, 3]);
    const A = mk([100, 100, 100, 100, 100, 100, 100, 100]);
    const r = runRotationBacktest([{ ticker: "A", bars: A }], signal, { ...BASE, dcaSlices: 4 });
    const buys = r.trades.filter((t) => t.side === "buy");
    const sells = r.trades.filter((t) => t.side === "sell");
    expect(buys).toHaveLength(2); // 슬라이스 2회만 집행되고
    expect(sells).toHaveLength(1); // 급락일 전량 청산
    expect(sells[0].date).toBe(D(5)); // d6 = idx5
    expect(r.trades.filter((t) => t.side === "buy" && t.date > D(5))).toHaveLength(0); // 이후 재매수 없음
  });

  it("일시금 vs DCA: 같은 데이터에서 총 매수수량은 같고 진입 분산만 다르다", () => {
    const signal = mk([10, 10, 10, 12, 13, 14, 15, 16]);
    const A = mk([100, 100, 100, 100, 100, 100, 100, 100]);
    const lump = runRotationBacktest([{ ticker: "A", bars: A }], signal, BASE);
    const dca = runRotationBacktest([{ ticker: "A", bars: A }], signal, { ...BASE, dcaSlices: 4 });
    const q = (r: typeof lump) => r.trades.filter((t) => t.side === "buy").reduce((s, t) => s + t.qty, 0);
    expect(q(lump)).toBe(q(dca)); // 가격 동일 구간이라 총량 일치
    expect(lump.trades.filter((t) => t.side === "buy")).toHaveLength(1);
    expect(dca.trades.filter((t) => t.side === "buy")).toHaveLength(4);
  });
});

describe("rotation 적립식(contribution) — 현금 드래그 제거", () => {
  // 월을 넘기며 날짜 생성(5거래일마다 다음 달) — 월경계 입금 트리거 확인용.
  const DM = (i: number) => {
    const m = Math.floor(i / 5) + 1;
    const d = (i % 5) + 1;
    return `2020-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  const mkM = (closes: number[]): Bar[] => closes.map((c, i) => ({ date: DM(i), open: c, high: c, low: c, close: c }));
  const CFG = { principal: 10000, smaPeriod: 3, bandPct: 0, momDays: 2, rebalanceDays: 100 };
  const signal = mkM(Array.from({ length: 15 }, (_, i) => 10 + i)); // 계속 상승 → 레짐 온
  const A = mkM(Array(15).fill(100));

  it("월경계마다 입금분을 보유 종목에 즉시 추가매수(레짐 온)", () => {
    const r = runRotationBacktest([{ ticker: "A", bars: A }], signal, { ...CFG, contribution: 500 });
    const buys = r.trades.filter((t) => t.side === "buy");
    const topups = buys.filter((b) => b.qty === 5); // floor(500/100)=5
    expect(topups).toHaveLength(2); // 2월·3월 경계 2회
    expect(r.contributions).toHaveLength(2);
    expect(r.totalContributed).toBe(10000 + 500 * 2);
    // 최종 보유수량 = 초기 100 + 적립 5×2 = 110
    const totalQty = buys.reduce((s, b) => s + b.qty, 0);
    expect(totalQty).toBe(110);
  });

  it("contribution 미지정/0 이면 기존과 동일(회귀)", () => {
    const a = runRotationBacktest([{ ticker: "A", bars: A }], signal, CFG);
    const b = runRotationBacktest([{ ticker: "A", bars: A }], signal, { ...CFG, contribution: 0 });
    expect(b.trades).toEqual(a.trades);
    expect(b.equityCurve).toEqual(a.equityCurve);
    expect(a.contributions).toBeUndefined();
    expect(a.totalContributed).toBeUndefined();
  });
});

describe("rotation 거래비용(feeRate)", () => {
  const signal = mk([10, 10, 10, 12, 13, 14, 15, 16]);
  const A = mk([100, 100, 100, 100, 100, 100, 100, 100]);

  it("feeRate 미지정/0 은 기존과 동일", () => {
    const a = runRotationBacktest([{ ticker: "A", bars: A }], signal, BASE);
    const b = runRotationBacktest([{ ticker: "A", bars: A }], signal, { ...BASE, feeRate: 0 });
    expect(b.trades).toEqual(a.trades);
    expect(b.equityCurve).toEqual(a.equityCurve);
  });

  it("feeRate>0 이면 매수수량 축소(q=floor(cash/(price·(1+fee)))) + 자산 감소", () => {
    const noFee = runRotationBacktest([{ ticker: "A", bars: A }], signal, BASE);
    const fee = runRotationBacktest([{ ticker: "A", bars: A }], signal, { ...BASE, feeRate: 0.01 });
    const buyNo = noFee.trades.find((t) => t.side === "buy")!;
    const buyFee = fee.trades.find((t) => t.side === "buy")!;
    expect(buyFee.qty).toBeLessThan(buyNo.qty); // 100 vs floor(10000/101)=99
    expect(buyFee.qty).toBe(Math.floor(10000 / (100 * 1.01)));
    expect(fee.equityCurve.at(-1)!.equity).toBeLessThan(noFee.equityCurve.at(-1)!.equity);
  });
});
