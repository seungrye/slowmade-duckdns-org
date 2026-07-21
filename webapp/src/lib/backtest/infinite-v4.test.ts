import { describe, it, expect } from "vitest";
import { runInfiniteV4Backtest, deriveVFromBars, revSellDecay } from "./infinite-v4";
import type { Bar } from "./types";

// 파이썬 tests/test_new_strategies.py v4 벡터와 동일 — 백테스트=실거래 단일코드(v4PlanDay)
// 를 종가-모름 가정(LOC 사다리·브로커 20% 거부 한계)으로 검증한다.

const bar = (date: string, close: number, high = close, low = close): Bar => ({ date, open: close, high, low, close });

// splits=4, principal=4000 → 첫 매수 1000$. V=15 명시 → 별% = 15 − 7.5T.
// (V 미지정이면 §5.3.2 로 봉에서 자동 유도되므로, 별% 값을 고정하려면 v 를 명시한다.)
const CFG = { principal: 4000, splits: 4, v: 15 };

describe("무한매수 V4.0 (공식 원문) — 일반모드", () => {
  it("첫 매수: 큰수(전일종가+10%)에 X/P주 + 사다리 X/k 1주 → 종가에 X 전액", () => {
    const r = runInfiniteV4Backtest([bar("d1", 100), bar("d2", 100)], CFG);
    expect(r.trades.filter((t) => t.date === "d1")).toHaveLength(0); // 첫날은 계획만
    const d2 = r.trades.filter((t) => t.date === "d2");
    // 종가를 모르고 주문: 110 에 9주 + 사다리 X/10=100 에 1주 → 종가 100 에 10주 = 1000$
    expect(d2.every((t) => t.side === "buy" && t.price === 100)).toBe(true);
    expect(d2.reduce((s, t) => s + t.qty, 0)).toBe(10);
  });

  it("다음날 +10% 초과 급등이면 첫 매수 미체결 → 기준 갱신 후 재시도", () => {
    // d2 115 > 100×1.10 → 미체결. d3 115 ≤ 115×1.10(기준 갱신) → 체결.
    const r = runInfiniteV4Backtest([bar("d1", 100), bar("d2", 115), bar("d3", 115)], CFG);
    expect(r.trades.filter((t) => t.date === "d2")).toHaveLength(0);
    expect(r.trades[0].date).toBe("d3");
  });

  it("75% 지정가매도(+15%)만 체결되면 T×0.25 (원문 T 정의: ×0.25+매수)", () => {
    // d2 진입 10주(T=1, 별지점 107.5). d3 high 120·종가 105: 75%(8주) @115 체결(고가 터치),
    // 쿼터 LOC(105<107.5) 미체결 → T=0.25 + 같은 날 별지점−0.01 매수 가산 → T < 1.5.
    const bars = [bar("d1", 100), bar("d2", 100), bar("d3", 105, 120), bar("d4", 90)];
    const r = runInfiniteV4Backtest(bars, CFG);
    const d3sell = r.trades.filter((t) => t.date === "d3" && t.side === "sell");
    expect(d3sell).toHaveLength(1);
    expect(d3sell[0].qty).toBe(8); // 10 − floor(10/4)=2 쿼터 제외한 75%
    const d4buy = r.trades.find((t) => t.date === "d4" && t.side === "buy");
    expect(d4buy).toBeDefined();
    expect(d4buy!.roundNo).toBeLessThan(1.5); // ×0.25 미반영이면 ≥2
  });

  it("쿼터매도(별지점 LOC)만 체결되면 T×0.75", () => {
    // d3 종가 110 ≥ 별지점 107.5 → 쿼터 2주 종가 체결. 75%(+15%=115)는 high 110 미달 → 잔존.
    const bars = [bar("d1", 100), bar("d2", 100), bar("d3", 110), bar("d4", 90)];
    const r = runInfiniteV4Backtest(bars, CFG);
    const d3sell = r.trades.filter((t) => t.date === "d3" && t.side === "sell");
    expect(d3sell).toHaveLength(1);
    expect(d3sell[0].qty).toBe(2); // floor(10/4)
    const d4buy = r.trades.find((t) => t.date === "d4" && t.side === "buy");
    expect(d4buy!.roundNo).toBeLessThan(2); // T=0.75 기반(감축 없으면 1+매수분으로 2 근접)
  });

  it("하락일(참조가−15%, 깊이 내): 사다리 항등식 — 누적 k주 종가 체결 ≈ 1회액", () => {
    // d3 종가 85: 별지점 4 + 평단 5 + 사다리(100·90.9) 2 = 11주 @85 = 935 ≈ X(1000).
    const bars = [bar("d1", 100), bar("d2", 100), bar("d3", 85)];
    const r = runInfiniteV4Backtest(bars, CFG);
    const d3buys = r.trades.filter((t) => t.date === "d3" && t.side === "buy");
    expect(d3buys.reduce((s, t) => s + t.qty, 0)).toBe(11);
    expect(d3buys.reduce((s, t) => s + t.price * t.qty, 0)).toBeCloseTo(935, 6);
  });

  it("폭락일(참조가−50%, 깊이 밖): 걸려있던 칸만 체결 — 부분 소진(실전과 동일)", () => {
    // d3 종가 50: 별지점4+평단5+사다리3(100/90.9/83.33 — 80=참조가−20% 까지만) = 12주 @50 = 600.
    const bars = [bar("d1", 100), bar("d2", 100), bar("d3", 50)];
    const r = runInfiniteV4Backtest(bars, CFG);
    const d3buys = r.trades.filter((t) => t.date === "d3" && t.side === "buy");
    expect(d3buys.reduce((s, t) => s + t.qty, 0)).toBe(12);
    expect(d3buys.reduce((s, t) => s + t.price * t.qty, 0)).toBeCloseTo(600, 6);
  });

  it("보통일(평단<종가≤별지점)엔 별지점 레그만 체결 → 절반만 소진", () => {
    // d3 종가 105(평단 100 위, 별지점−0.01=107.49 아래): 별지점 레그만 체결.
    const bars = [bar("d1", 100), bar("d2", 100), bar("d3", 105)];
    const r = runInfiniteV4Backtest(bars, CFG);
    const d3buys = r.trades.filter((t) => t.date === "d3" && t.side === "buy");
    const spent = d3buys.reduce((s, t) => s + t.price * t.qty, 0);
    expect(d3buys.length).toBe(1);
    expect(spent).toBeLessThanOrEqual(500); // 1회액의 절반(one/2=500) 이하
  });
});

describe("무한매수 V4.0 — 소진후 리버스모드", () => {
  /** 완만한 연속 하락(−14%/일, 사다리 깊이 내)으로 T 를 소진시키는 시나리오 생성. */
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
    // 진입 후 매일 ≈1회분 체결 → T>3 소진 → 리버스 첫날 MOC 매도 1건만.
    const r = runInfiniteV4Backtest(declineBars(0), CFG);
    // 리버스 첫날 = 매수 없이 매도 1건만 있는 첫 날
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
    expect(ts[0].qty).toBeLessThan(heldBefore); // 전량 아님
  });

  it("리버스 둘째날부터: 별지점R(또는 큰수) 아래 종가면 잔금/4 쿼터매수", () => {
    const base = runInfiniteV4Backtest(declineBars(0), CFG);
    const more = runInfiniteV4Backtest(declineBars(2), CFG);
    // 리버스 첫날 이후 이틀 더 하락 → 추가 매수(쿼터매수)가 발생한다
    const baseBuys = base.trades.filter((t) => t.side === "buy").length;
    const moreBuys = more.trades.filter((t) => t.side === "buy").length;
    expect(moreBuys).toBeGreaterThan(baseBuys);
  });
});

describe("무한매수 V4.0 — V(변동성 계수) 팩터", () => {
  // 알려진 σ 시나리오: 로그수익률 ±0.05 교대 → 표본σ=0.05774 → V=round(4×5.774)=23.
  const knownSigmaBars = (): Bar[] => {
    const closes = [100, 100 * Math.exp(0.05), 100, 100 * Math.exp(0.05), 100];
    return closes.map((c, i) => bar(`s${i}`, c));
  };

  it("deriveVFromBars: V ≈ 4 × 일간 σ% (§5.3.2)", () => {
    expect(deriveVFromBars(knownSigmaBars())).toBe(23); // 4 × 5.774% ≈ 23.09 → 23
  });

  it("deriveVFromBars: σ=0(평탄) 또는 표본 부족이면 15(TQQQ) 폴백", () => {
    expect(deriveVFromBars([bar("a", 100), bar("b", 100), bar("c", 100)])).toBe(15); // σ=0
    expect(deriveVFromBars([bar("a", 100)])).toBe(15); // 수익률 표본 <2
    expect(deriveVFromBars([])).toBe(15);
  });

  it("revSellDecay: 1 − 1/(splits/2) — 40→0.95·20→0.90·30→0.9333 (30분할 교정)", () => {
    expect(revSellDecay(40)).toBeCloseTo(0.95, 10);
    expect(revSellDecay(20)).toBeCloseTo(0.9, 10);
    expect(revSellDecay(30)).toBeCloseTo(0.9333, 4); // 기존 삼항은 0.95 로 오채점했다
  });

  it("V 오버라이드: 최종매도 목표가 = 평단×(1+V/100) — V=15→115, V=20→120", () => {
    // d2 진입 10주@100(평단100,T=1). d3 high125·종가105: 75% 지정가매도가 target 에 체결.
    const bars = [bar("d1", 100), bar("d2", 100), bar("d3", 105, 125)];
    const r15 = runInfiniteV4Backtest(bars, { principal: 4000, splits: 4, v: 15 });
    const r20 = runInfiniteV4Backtest(bars, { principal: 4000, splits: 4, v: 20 });
    const sell15 = r15.trades.find((t) => t.date === "d3" && t.side === "sell");
    const sell20 = r20.trades.find((t) => t.date === "d3" && t.side === "sell");
    expect(sell15!.price).toBe(114.99); // 100 × 1.15 = 114.999… → 버림(r2=Math.trunc) 114.99
    expect(sell20!.price).toBe(120); // 100 × 1.20 → 120
    expect(sell20!.price).toBeGreaterThan(sell15!.price); // V↑ → 최종매도 목표가↑
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
