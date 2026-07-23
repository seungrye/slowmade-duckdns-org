import { describe, it, expect } from "vitest";
import {
  runFactor,
  runEqualWeight,
  runBuyHold,
  trimAndRebase,
  selectNames,
  runFactorComparison,
  type FactorMatrix,
  type FactorParams,
} from "./factor";

// n 거래일의 날짜 배열(2020-01-01 부터). new Date(인자) 는 결정적이라 안전.
function mkDates(n: number): string[] {
  return Array.from({ length: n }, (_, i) => new Date(2020, 0, 1 + i).toISOString().slice(0, 10));
}
function ser(n: number, fn: (i: number) => number): (number | null)[] {
  return Array.from({ length: n }, (_, i) => fn(i));
}

const N = 40;
const dates = mkDates(N);
// 테스트용 작은 룩백 파라미터.
const P: FactorParams = { quantile: 0.5, volLookback: 20, momLong: 20, momSkip: 3, revLookback: 5, minNames: 1 };

describe("factor — 저변동성 선택", () => {
  it("변동성 낮은 종목을 고른다(고변동 제외)", () => {
    const closes = new Map<string, (number | null)[]>([
      ["VOL0", ser(N, () => 100)], // 상수 → std 0
      ["VOL1", ser(N, (i) => 100 * (1 + (i % 2 ? 0.005 : -0.005)))], // 소
      ["VOL2", ser(N, (i) => 100 * (1 + (i % 2 ? 0.02 : -0.02)))], // 중
      ["VOL3", ser(N, (i) => 100 * (1 + (i % 2 ? 0.06 : -0.06)))], // 대
    ]);
    const sel = selectNames({ dates, closes }, "low_vol", N - 1, P);
    expect(sel).toContain("VOL0");
    expect(sel).toContain("VOL1");
    expect(sel).not.toContain("VOL3"); // 최고변동은 제외
  });
});

describe("factor — 모멘텀/평균회귀 선택", () => {
  const closes = new Map<string, (number | null)[]>([
    ["UP", ser(N, (i) => 100 * Math.pow(1.01, i))], // 꾸준한 상승 → 모멘텀 상위·최근 승자
    ["DOWN", ser(N, (i) => 100 * Math.pow(0.99, i))], // 꾸준한 하락 → 모멘텀 하위·최근 패자
    ["FLATA", ser(N, () => 100)],
    ["FLATB", ser(N, () => 50)],
  ]);
  const m: FactorMatrix = { dates, closes };

  it("모멘텀은 상승주(UP)를 고르고 하락주(DOWN)를 뺀다", () => {
    const sel = selectNames(m, "momentum", N - 1, P);
    expect(sel).toContain("UP");
    expect(sel).not.toContain("DOWN");
  });

  it("평균회귀는 최근 하락주(DOWN)를 고르고 상승주(UP)를 뺀다", () => {
    const sel = selectNames(m, "reversal", N - 1, P);
    expect(sel).toContain("DOWN");
    expect(sel).not.toContain("UP");
  });
});

describe("factor — 곡선/벤치마크/재기준", () => {
  const closes = new Map<string, (number | null)[]>([
    ["A", ser(N, (i) => 100 * Math.pow(1.005, i))],
    ["B", ser(N, (i) => 100 * Math.pow(1.002, i))],
    ["C", ser(N, () => 100)],
  ]);
  const m: FactorMatrix = { dates, closes };

  it("runFactor 곡선 길이 = 거래일 수, equity 양수", () => {
    const eq = runFactor(m, "momentum", P);
    expect(eq).toHaveLength(N);
    expect(eq.every((p) => p.equity > 0)).toBe(true);
  });

  it("runBuyHold(A) 는 A 의 상승률만큼 오른다", () => {
    const eq = runBuyHold(m, "A");
    expect(eq[0].equity).toBeCloseTo(1, 6);
    expect(eq[N - 1].equity).toBeGreaterThan(1); // A 상승
  });

  it("runEqualWeight 는 모든 상장 종목을 담아 곡선 생성", () => {
    const eq = runEqualWeight(m);
    expect(eq).toHaveLength(N);
    expect(eq[N - 1].equity).toBeGreaterThan(1);
  });

  it("trimAndRebase: 창 밖 제거 + 시작=1", () => {
    const eq = runBuyHold(m, "A");
    const t = trimAndRebase(eq, dates[10], dates[20]);
    expect(t).toHaveLength(11);
    expect(t[0].equity).toBeCloseTo(1, 6);
  });

  it("runFactorComparison: 3팩터 + 동일가중(+시장) 행 반환·지표 계산", () => {
    const rows = runFactorComparison(m, { from: dates[21], to: dates[N - 1], marketTicker: "A", params: P });
    const keys = rows.map((r) => r.key);
    expect(keys).toContain("low_vol");
    expect(keys).toContain("momentum");
    expect(keys).toContain("reversal");
    expect(keys).toContain("equal_weight");
    expect(keys).toContain("market");
    for (const r of rows) {
      expect(r.equityCurve[0].equity).toBeCloseTo(1, 6);
      expect(Number.isFinite(r.metrics.cagr)).toBe(true);
    }
  });
});
