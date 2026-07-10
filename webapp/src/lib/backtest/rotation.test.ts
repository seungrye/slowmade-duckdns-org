import { describe, it, expect } from "vitest";
import { runRotationBacktest } from "./rotation";
import type { Bar } from "./types";

const D = (i: number) => `2020-01-${String(i + 1).padStart(2, "0")}`;
const mk = (closes: number[]): Bar[] =>
  closes.map((c, i) => ({ date: D(i), open: c, high: c, low: c, close: c }));

// 시그널: SMA3 위 유지(레짐 온) 기본. cfg: sma 3, band 0, mom 2, rebalance 2.
const CFG = { principal: 10000, smaPeriod: 3, bandPct: 0, momDays: 2, rebalanceDays: 2 };

describe("rotation_v1 — 듀얼 모멘텀 로테이션", () => {
  it("레짐 온 진입 시 모멘텀 1위 종목을 산다", () => {
    const signal = mk([10, 10, 10, 12, 13]); // d4부터 SMA 위
    const A = mk([100, 100, 100, 100, 100]); // 모멘텀 0%
    const B = mk([100, 100, 110, 120, 130]); // 모멘텀 강함
    const r = runRotationBacktest(
      [{ ticker: "A", bars: A }, { ticker: "B", bars: B }], signal, CFG);
    const first = r.trades[0];
    expect(first.side).toBe("buy");
    expect(first.ticker).toBe("B"); // 1위 선택
  });

  it("재평가 주기에 1위가 바뀌면 같은 날 종가로 교체한다", () => {
    // 초반 B 강세 → 이후 A 강세로 역전. rebalance 2일마다 재평가.
    // 시그널은 계속 SMA 위(상승 추세)여야 재평가 카운터가 돈다(밴드 경계=유지만).
    const signal = mk([10, 10, 10, 12, 13, 14, 15, 16]);
    const A = mk([100, 100, 100, 100, 120, 150, 190, 240]); // 후반 급등
    const B = mk([100, 100, 110, 120, 121, 121, 121, 121]); // 정체
    const r = runRotationBacktest(
      [{ ticker: "A", bars: A }, { ticker: "B", bars: B }], signal, CFG);
    const switchSell = r.trades.find((t) => t.side === "sell" && t.ticker === "B");
    const switchBuy = r.trades.find((t) => t.side === "buy" && t.ticker === "A");
    expect(switchSell).toBeDefined(); // B 청산
    expect(switchBuy).toBeDefined(); // A 로 교체
    expect(switchSell!.date).toBe(switchBuy!.date); // 같은 날 스위칭
  });

  it("레짐 오프(시그널<SMA−밴드)면 리밸런스 주기와 무관하게 즉시 전량 현금", () => {
    const signal = mk([10, 10, 10, 12, 5, 5, 5, 5]); // d5 급락 → 레짐 오프
    const A = mk([100, 100, 110, 120, 125, 130, 135, 140]); // 종목은 멀쩡해도
    const r = runRotationBacktest([{ ticker: "A", bars: A }], signal, { ...CFG, momDays: 1 });
    const exit = r.trades.find((t) => t.side === "sell");
    expect(exit).toBeDefined();
    expect(exit!.date).toBe(D(4)); // 급락 당일 청산(주기 대기 없음)
    expect(r.trades.filter((t) => t.date > D(4) && t.side === "buy")).toHaveLength(0); // 재진입 없음(레짐 오프 지속)
  });

  it("from 이전은 워밍업만 하고 매매하지 않는다", () => {
    const signal = mk([10, 10, 10, 12, 13, 14]);
    const A = mk([100, 100, 110, 120, 130, 140]);
    const r = runRotationBacktest([{ ticker: "A", bars: A }], signal, { ...CFG, momDays: 1, from: D(5) });
    expect(r.trades.every((t) => t.date >= D(5))).toBe(true);
    expect(r.equityCurve[0].date).toBe(D(5)); // 곡선도 매매 구간만
  });
});
