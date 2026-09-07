import { describe, it, expect } from "vitest";
import { runInfiniteV4Backtest, deriveVFromBars, revSellDecay } from "./infinite-v4";
import type { Bar } from "./types";

// The same vectors as the v4 ones in Python's tests/test_new_strategies.py - it checks the single code path shared
// by backtest and live (v4PlanDay) under the close-is-unknown assumption (the LOC ladder, the broker's 20% rejection limit).

const bar = (date: string, close: number, high = close, low = close): Bar => ({ date, open: close, high, low, close });

// splits=4, principal=4000 -> a first buy of $1000. With V=15 given, star% = 15 - 7.5T.
// (Without V it is derived from the bars per section 5.3.2, so v is given here to pin star%.)
const CFG = { principal: 4000, splits: 4, v: 15 };

describe("무한매수 V4.0 (공식 원문) — 일반모드", () => {
  it("첫 매수: 큰수(전일종가+10%)에 X/P주 + 사다리 X/k 1주 → 종가에 X 전액", () => {
    const r = runInfiniteV4Backtest([bar("d1", 100), bar("d2", 100)], CFG);
    expect(r.trades.filter((t) => t.date === "d1")).toHaveLength(0); // the first day only plans
    const d2 = r.trades.filter((t) => t.date === "d2");
    // Ordering without knowing the close: 9 shares at 110 plus 1 on the ladder at X/10 = 100 -> 10 shares at a close of 100 = $1000
    expect(d2.every((t) => t.side === "buy" && t.price === 100)).toBe(true);
    expect(d2.reduce((s, t) => s + t.qty, 0)).toBe(10);
  });

  it("다음날 +10% 초과 급등이면 첫 매수 미체결 → 기준 갱신 후 재시도", () => {
    // d2's 115 > 100 x 1.10 -> unfilled. d3's 115 <= 115 x 1.10 (the refreshed reference) -> filled.
    const r = runInfiniteV4Backtest([bar("d1", 100), bar("d2", 115), bar("d3", 115)], CFG);
    expect(r.trades.filter((t) => t.date === "d2")).toHaveLength(0);
    expect(r.trades[0].date).toBe("d3");
  });

  it("75% 지정가매도(+15%)만 체결되면 T×0.25 (원문 T 정의: ×0.25+매수)", () => {
    // d2 enters 10 shares (T=1, star point 107.5). d3 high 120, close 105: the 75% (8 shares) fills @115 (the high touches it),
    // while the quarter LOC (105 < 107.5) does not -> T = 0.25 plus the same day's star-point-minus-0.01 buy -> T < 1.5.
    const bars = [bar("d1", 100), bar("d2", 100), bar("d3", 105, 120), bar("d4", 90)];
    const r = runInfiniteV4Backtest(bars, CFG);
    const d3sell = r.trades.filter((t) => t.date === "d3" && t.side === "sell");
    expect(d3sell).toHaveLength(1);
    expect(d3sell[0].qty).toBe(8); // the 75%, excluding the quarter of 10 - floor(10/4) = 2
    const d4buy = r.trades.find((t) => t.date === "d4" && t.side === "buy");
    expect(d4buy).toBeDefined();
    expect(d4buy!.roundNo).toBeLessThan(1.5); // without the x0.25 it would be >= 2
  });

  it("쿼터매도(별지점 LOC)만 체결되면 T×0.75", () => {
    // d3 close 110 >= star point 107.5 -> the quarter's 2 shares fill at the close. The 75% (+15% = 115) is above the high of 110 and remains.
    const bars = [bar("d1", 100), bar("d2", 100), bar("d3", 110), bar("d4", 90)];
    const r = runInfiniteV4Backtest(bars, CFG);
    const d3sell = r.trades.filter((t) => t.date === "d3" && t.side === "sell");
    expect(d3sell).toHaveLength(1);
    expect(d3sell[0].qty).toBe(2); // floor(10/4)
    const d4buy = r.trades.find((t) => t.date === "d4" && t.side === "buy");
    expect(d4buy!.roundNo).toBeLessThan(2); // based on T = 0.75 (with no reduction it would approach 1 + the buy, near 2)
  });

  it("하락일(참조가−15%, 깊이 내): 사다리 항등식 — 누적 k주 종가 체결 ≈ 1회액", () => {
    // d3 close 85: star point 4 + average 5 + ladder (100, 90.9) 2 = 11 shares @85 = 935, about X (1000).
    const bars = [bar("d1", 100), bar("d2", 100), bar("d3", 85)];
    const r = runInfiniteV4Backtest(bars, CFG);
    const d3buys = r.trades.filter((t) => t.date === "d3" && t.side === "buy");
    expect(d3buys.reduce((s, t) => s + t.qty, 0)).toBe(11);
    expect(d3buys.reduce((s, t) => s + t.price * t.qty, 0)).toBeCloseTo(935, 6);
  });

  it("폭락일(참조가−50%, 깊이 밖): 걸려있던 칸만 체결 — 부분 소진(실전과 동일)", () => {
    // d3 close 50: star point 4 + average 5 + ladder 3 (100 / 90.9 / 83.33 - only down to 80 = reference - 20%) = 12 shares @50 = 600.
    const bars = [bar("d1", 100), bar("d2", 100), bar("d3", 50)];
    const r = runInfiniteV4Backtest(bars, CFG);
    const d3buys = r.trades.filter((t) => t.date === "d3" && t.side === "buy");
    expect(d3buys.reduce((s, t) => s + t.qty, 0)).toBe(12);
    expect(d3buys.reduce((s, t) => s + t.price * t.qty, 0)).toBeCloseTo(600, 6);
  });

  it("보통일(평단<종가≤별지점)엔 별지점 레그만 체결 → 절반만 소진", () => {
    // d3 close 105 (above the average of 100, below star point - 0.01 = 107.49): only the star-point leg fills.
    const bars = [bar("d1", 100), bar("d2", 100), bar("d3", 105)];
    const r = runInfiniteV4Backtest(bars, CFG);
    const d3buys = r.trades.filter((t) => t.date === "d3" && t.side === "buy");
    const spent = d3buys.reduce((s, t) => s + t.price * t.qty, 0);
    expect(d3buys.length).toBe(1);
    expect(spent).toBeLessThanOrEqual(500); // at most half of one round (one/2 = 500)
  });
});

describe("무한매수 V4.0 — 소진후 리버스모드", () => {
  /** Builds a scenario that spends T through a steady decline (-14%/day, within ladder depth). */
  const declineBars = (extraDays: number): Bar[] => {
    const bars = [bar("d01", 100), bar("d02", 100)];
    let px = 100;
    for (let i = 3; i < 3 + 9 + extraDays; i++) {
      px = Math.round(px * 0.86 * 100) / 100;
      bars.push(bar(`d${String(i).padStart(2, "0")}`, px));
    }
    return bars;
  };

  it("T 소진 시 리버스 진입: 첫날 보유/(분할/2) 내림 MOC 매도, 매수 없음", () => {
    // After entry, about one round fills daily -> T > 3 is spent -> the first reverse day has a single MOC sell.
    const r = runInfiniteV4Backtest(declineBars(0), CFG);
    // The first reverse day = the first day with one sell and no buy
    const byDate = new Map<string, typeof r.trades>();
    for (const t of r.trades) {
      byDate.set(t.date, [...(byDate.get(t.date) ?? []), t]);
    }
    const revFirst = [...byDate.entries()].find(([, ts]) => ts.length === 1 && ts[0].side === "sell");
    expect(revFirst).toBeDefined();
    const [date, ts] = revFirst!;
    const heldBefore = r.trades.filter((t) => t.date < date)
      .reduce((s, t) => s + (t.side === "buy" ? t.qty : -t.qty), 0);
    expect(ts[0].qty).toBe(Math.floor(heldBefore / 2)); // divisor = splits/2 = 2
    expect(ts[0].qty).toBeLessThan(heldBefore); // not the whole holding
  });

  it("리버스 둘째날부터: 별지점R(또는 큰수) 아래 종가면 잔금/4 쿼터매수", () => {
    const base = runInfiniteV4Backtest(declineBars(0), CFG);
    const more = runInfiniteV4Backtest(declineBars(2), CFG);
    // Two more down days after the first reverse day produce an extra (quarter) buy
    const baseBuys = base.trades.filter((t) => t.side === "buy").length;
    const moreBuys = more.trades.filter((t) => t.side === "buy").length;
    expect(moreBuys).toBeGreaterThan(baseBuys);
  });
});

describe("무한매수 V4.0 — V(변동성 계수) 팩터", () => {
  // A known-sigma scenario: log returns alternating +/-0.05 -> sample sigma 0.05774 -> V = round(4 x 5.774) = 23.
  const knownSigmaBars = (): Bar[] => {
    const closes = [100, 100 * Math.exp(0.05), 100, 100 * Math.exp(0.05), 100];
    return closes.map((c, i) => bar(`s${i}`, c));
  };

  it("deriveVFromBars: V ≈ 4 × 일간 σ% (§5.3.2)", () => {
    expect(deriveVFromBars(knownSigmaBars())).toBe(23); // 4 × 5.774% ≈ 23.09 → 23
  });

  it("deriveVFromBars: σ=0(평탄) 또는 표본 부족이면 15(TQQQ) 폴백", () => {
    expect(deriveVFromBars([bar("a", 100), bar("b", 100), bar("c", 100)])).toBe(15); // σ=0
    expect(deriveVFromBars([bar("a", 100)])).toBe(15); // fewer than 2 return samples
    expect(deriveVFromBars([])).toBe(15);
  });

  it("revSellDecay: 1 − 1/(splits/2) — 40→0.95·20→0.90·30→0.9333 (30분할 교정)", () => {
    expect(revSellDecay(40)).toBeCloseTo(0.95, 10);
    expect(revSellDecay(20)).toBeCloseTo(0.9, 10);
    expect(revSellDecay(30)).toBeCloseTo(0.9333, 4); // the old ternary mis-scored this as 0.95
  });

  it("V 오버라이드: 최종매도 목표가 = 평단×(1+V/100) — V=15→115, V=20→120", () => {
    // d2 enters 10 shares @100 (average 100, T=1). d3 high 125, close 105: the 75% limit sell fills at target.
    const bars = [bar("d1", 100), bar("d2", 100), bar("d3", 105, 125)];
    const r15 = runInfiniteV4Backtest(bars, { principal: 4000, splits: 4, v: 15 });
    const r20 = runInfiniteV4Backtest(bars, { principal: 4000, splits: 4, v: 20 });
    const sell15 = r15.trades.find((t) => t.date === "d3" && t.side === "sell");
    const sell20 = r20.trades.find((t) => t.date === "d3" && t.side === "sell");
    expect(sell15!.price).toBe(114.99); // 100 x 1.15 = 114.999… -> truncated (r2 = Math.trunc) to 114.99
    expect(sell20!.price).toBe(120); // 100 × 1.20 → 120
    expect(sell20!.price).toBeGreaterThan(sell15!.price); // a higher V raises the final sell target
    expect(r15.resolvedV).toBe(15);
    expect(r20.resolvedV).toBe(20);
  });

  it("V 미지정이면 §5.3.2 자동 유도 — resolvedV = deriveVFromBars(bars)", () => {
    const bars = knownSigmaBars();
    const r = runInfiniteV4Backtest(bars, { principal: 4000, splits: 4 });
    expect(r.resolvedV).toBe(deriveVFromBars(bars)); // 23
    expect(r.resolvedV).toBe(23);
  });

  it("V=0 도 미지정과 동일하게 자동 유도(falsy 처리)", () => {
    const bars = knownSigmaBars();
    const r = runInfiniteV4Backtest(bars, { principal: 4000, splits: 4, v: 0 });
    expect(r.resolvedV).toBe(23);
  });
});
