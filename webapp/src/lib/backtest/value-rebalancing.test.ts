import { describe, it, expect } from "vitest";
import {
  updateVBasic, bandOf, rebalanceShares, runValueRebalancingBacktest,
  seedVR, cycleCoverSellQty, advanceCycleVR, applyVRFill,
  vrFormOf, defaultsForForm, effectiveAvgPrice,
} from "./value-rebalancing";
import type { Bar, ValueRebalancingConfig } from "./types";
import type { RotationCandidate } from "./rotation";

// ── 순수 헬퍼 ──
describe("VR updateVBasic — V₂ = V₁ + Pool/G + CF", () => {
  it("원문 예시: V9000·Pool1000·G10·CF250 → 9350", () => {
    expect(updateVBasic(9000, 1000, 10, 250)).toBe(9350);
  });
  it("거치(CF=0): V += Pool/G", () => {
    expect(updateVBasic(9000, 1000, 10, 0)).toBe(9100);
  });
  it("Pool=0 이면 V 정체(상승률=1, 존버 한계)", () => {
    expect(updateVBasic(9000, 0, 10, 0)).toBe(9000);
  });
  it("인출(CF<0): V₂ = V₁ + Pool/G − 인출", () => {
    expect(updateVBasic(9000, 1000, 20, -100)).toBe(8950); // 9000+50-100
  });
});

describe("VR bandOf — [V(1−b), V(1+b)]", () => {
  it("V=8500, b=0.15 → [7225, 9775]", () => {
    expect(bandOf(8500, 0.15)).toEqual({ low: 7225, high: 9775 });
  });
});

describe("VR rebalanceShares — 밴드 복귀 수량", () => {
  const band = { low: 7225, high: 9775 };
  it("평가금 > 상단 → 매도(음수)", () => {
    // qty85·price130 → 평가금 11050 > 9775 → floor((11050-9775)/130)=9 매도
    expect(rebalanceShares({ qty: 85, price: 130, ...band, buyBudget: 1000, pool: 1500, fee: 0 })).toBe(-9);
  });
  it("평가금 < 하단 → 매수(양수), 하단까지", () => {
    // qty85·price80 → 평가금 6800 < 7225 → floor(425/80)=5, 한도/풀 여유 충분
    expect(rebalanceShares({ qty: 85, price: 80, ...band, buyBudget: 750, pool: 1500, fee: 0 })).toBe(5);
  });
  it("매수는 사이클 한도(buyBudget)로 컷", () => {
    // 원하는 5주지만 buyBudget 200 → floor(200/80)=2 주만
    expect(rebalanceShares({ qty: 85, price: 80, ...band, buyBudget: 200, pool: 1500, fee: 0 })).toBe(2);
  });
  it("밴드 안이면 0(무행동)", () => {
    expect(rebalanceShares({ qty: 85, price: 100, ...band, buyBudget: 750, pool: 1500, fee: 0 })).toBe(0);
  });
});

// ── 러너 ──
const DM = (i: number) => `2020-${String(Math.floor(i / 20) + 1).padStart(2, "0")}-${String((i % 20) + 1).padStart(2, "0")}`;
const mk = (closes: number[]): Bar[] => closes.map((c, i) => ({ date: DM(i), open: c, high: c, low: c, close: c }));
const cand = (closes: number[]): RotationCandidate => ({ ticker: "TQQQ", bars: mk(closes) });
const CFG = { principal: 10000, gradient: 10, bandPct: 0.15, poolLimitPct: 0.5, cycleDays: 5, initStockRatio: 0.85 };
const heldQty = (r: ReturnType<typeof runValueRebalancingBacktest>) =>
  r.trades.filter((t) => t.side === "buy").reduce((s, t) => s + t.qty, 0) -
  r.trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.qty, 0);

describe("runValueRebalancingBacktest — 러너", () => {
  it("초기 진입: 85:15 분할, 첫 매수 1건", () => {
    const r = runValueRebalancingBacktest(cand(Array(30).fill(100)), CFG);
    const first = r.trades[0];
    expect(first).toMatchObject({ side: "buy", price: 100, qty: 85 }); // floor(8500/100)
  });

  it("상승장 — 매도로 자산 증가·보유수량 감소", () => {
    const r = runValueRebalancingBacktest(cand(Array.from({ length: 40 }, (_, i) => 100 + i * 3)), CFG);
    expect(r.trades.filter((t) => t.side === "sell").length).toBeGreaterThan(0);
    expect(heldQty(r)).toBeLessThan(85);
    expect(r.equityCurve.at(-1)!.equity).toBeGreaterThan(10000);
  });

  it("하락장 — 물타기 매수로 보유수량 증가(한도 내)", () => {
    const r = runValueRebalancingBacktest(cand(Array.from({ length: 40 }, (_, i) => 100 - i * 1.5)), CFG);
    expect(r.trades.filter((t) => t.side === "buy").length).toBeGreaterThan(1);
    expect(heldQty(r)).toBeGreaterThan(85);
  });

  it("인출(CF<0) — 사이클마다 음수 flow 기록, 순유출", () => {
    const r = runValueRebalancingBacktest(cand(Array.from({ length: 30 }, (_, i) => 100 + i)), { ...CFG, cashflow: -200 });
    expect(r.contributions!.length).toBeGreaterThan(0);
    expect(r.contributions!.every((c) => c.amount === -200)).toBe(true);
    expect(r.totalContributed!).toBeLessThan(10000);
  });

  it("feeRate 미지정/0 동일(회귀)", () => {
    const bars = cand(Array.from({ length: 30 }, (_, i) => 100 + i * 2));
    const a = runValueRebalancingBacktest(bars, CFG);
    const b = runValueRebalancingBacktest(bars, { ...CFG, feeRate: 0 });
    expect(b.trades).toEqual(a.trades);
    expect(b.equityCurve).toEqual(a.equityCurve);
  });
});

// ── 라이브 공용 순수 함수(백테스트=라이브 단일 소스) ──
const VCFG: ValueRebalancingConfig = { principal: 10000, gradient: 10, bandPct: 0.15, poolLimitPct: 0.5, cycleDays: 5, initStockRatio: 0.85 };

describe("VR seedVR — 초기 85:15 분할", () => {
  it("qty=floor(85%/price), pool=원금−매수액, V=매수후평가, buyBudget=u×pool", () => {
    const s = seedVR(VCFG, 100);
    expect(s).toEqual({ qty: 85, pool: 1500, V: 8500, buyBudget: 750, sinceCycle: 0, cumBuy: 8500, cumSell: 0 });
  });
  it("수수료 반영: 매수여력이 (1+fee)로 줄어 주수↓", () => {
    const s = seedVR({ ...VCFG, feeRate: 0.01 }, 100);
    expect(s.qty).toBe(Math.floor(8500 / (100 * 1.01))); // 84
  });
});

describe("VR applyVRFill — 체결 장부 반영", () => {
  const base = seedVR(VCFG, 100); // qty85 pool1500 buyBudget750
  it("매수: pool·buyBudget↓, qty·cumBuy↑", () => {
    const s = applyVRFill(base, { side: "buy", qty: 5, price: 80 }, 0);
    expect(s.qty).toBe(90);
    expect(s.pool).toBe(1500 - 400);
    expect(s.buyBudget).toBe(750 - 400);
    expect(s.cumBuy).toBe(8500 + 400);
  });
  it("매도: pool·cumSell↑, qty↓ (buyBudget 무관)", () => {
    const s = applyVRFill(base, { side: "sell", qty: 9, price: 130 }, 0);
    expect(s.qty).toBe(76);
    expect(s.pool).toBe(1500 + 1170);
    expect(s.cumSell).toBe(1170);
    expect(s.buyBudget).toBe(750);
  });
});

describe("VR advanceCycleVR — 사이클 경계 V 갱신", () => {
  it("원문 예시: V9000·Pool1000·G10·CF250 → V9350·Pool1250·budget=u×1250·sinceCycle0", () => {
    const st = { qty: 50, pool: 1000, V: 9000, buyBudget: 111, sinceCycle: 5, cumBuy: 0, cumSell: 0 };
    const s = advanceCycleVR(st, { ...VCFG, cashflow: 250 });
    expect(s.V).toBe(9350);
    expect(s.pool).toBe(1250);
    expect(s.buyBudget).toBe(0.5 * 1250);
    expect(s.sinceCycle).toBe(0);
  });
  it("거치(CF=0): V += Pool/G, pool 불변", () => {
    const st = { qty: 50, pool: 1000, V: 9000, buyBudget: 0, sinceCycle: 5, cumBuy: 0, cumSell: 0 };
    const s = advanceCycleVR(st, VCFG);
    expect(s.V).toBe(9100);
    expect(s.pool).toBe(1000);
  });
});

describe("VR cycleCoverSellQty — 인출 충당 매도", () => {
  const st = { qty: 85, pool: 100, V: 8500, buyBudget: 50, sinceCycle: 5, cumBuy: 0, cumSell: 0 };
  it("CF<0 이고 Pool+CF<0 → 부족분을 주식 매도로 충당(올림)", () => {
    expect(cycleCoverSellQty(st, { ...VCFG, cashflow: -300 }, 100)).toBe(2); // ceil(200/100)
  });
  it("Pool 충분하면 0", () => {
    expect(cycleCoverSellQty({ ...st, pool: 500 }, { ...VCFG, cashflow: -300 }, 100)).toBe(0);
  });
  it("거치(CF≥0)면 0", () => {
    expect(cycleCoverSellQty(st, VCFG, 100)).toBe(0);
  });
});

// ── 차트용 밴드 (#341) ──
describe("vrBand — 왜 사고팔았는지 그리려면", () => {
  const flat = () => runValueRebalancingBacktest(cand(Array(30).fill(100)), CFG);

  it("하루에 한 줄씩 낸다", () => {
    const r = flat();
    expect(r.vrBand).toHaveLength(r.equityCurve.length);
    expect(r.vrBand!.map((x) => x.date)).toEqual(r.equityCurve.map((e) => e.date));
  });

  it("밴드는 목표 V 를 b 만큼 위아래로 벌린 것", () => {
    for (const row of flat().vrBand!) {
      expect(row.low).toBeCloseTo(row.v * (1 - CFG.bandPct), 6);
      expect(row.high).toBeCloseTo(row.v * (1 + CFG.bandPct), 6);
    }
  });

  /**
   * 밴드가 감싸는 것은 **주식 평가금**이지 총자산이 아니다.
   * equityCurve.equity 는 qty×price + pool 이라 Pool 현금만큼 늘 위로 떠, 그걸 밴드와
   * 겹치면 "항상 밴드 밖" 처럼 보인다. 그래서 stock 을 따로 낸다.
   */
  it("stock 은 주식 평가금만 — 총자산보다 Pool 만큼 작다", () => {
    const r = flat();
    for (let i = 0; i < r.vrBand!.length; i++) {
      expect(r.vrBand![i].stock).toBeLessThanOrEqual(r.equityCurve[i].equity);
    }
    // 초기 85:15 분할이라 Pool 이 남아 있다 — 둘이 같으면 안 된다.
    expect(r.vrBand![0].stock).toBeLessThan(r.equityCurve[0].equity);
  });

  it("밴드 안에 있으면 그날 매매가 없다", () => {
    const r = flat();
    const 매매일 = new Set(r.trades.map((t) => t.date));
    for (const row of r.vrBand!) {
      const 안쪽 = row.stock > row.low && row.stock < row.high;
      if (안쪽 && row.date !== r.vrBand![0].date) {
        expect(매매일.has(row.date), `${row.date} 는 밴드 안인데 매매가 있다`).toBe(false);
      }
    }
  });

  it("밴드는 사이클 경계에서만 바뀐다 — 계단 모양이다", () => {
    const r = runValueRebalancingBacktest(cand(Array.from({ length: 30 }, (_, i) => 100 + i)), CFG);
    const 바뀐횟수 = r.vrBand!.filter((row, i) => i > 0 && row.v !== r.vrBand![i - 1].v).length;

    expect(바뀐횟수).toBeGreaterThan(0);
    // 매일 바뀌면 계단이 아니다 — cycleDays(5)마다이므로 날 수보다 훨씬 적어야 한다.
    expect(바뀐횟수).toBeLessThan(r.vrBand!.length / 2);
  });

  it("바가 없으면 빈 배열", () => {
    expect(runValueRebalancingBacktest(cand([]), CFG).vrBand).toEqual([]);
  });
});

// ── 운용 형태에서 기본값 유도 (#345) ──
describe("vrFormOf — CF 부호가 운용 형태를 정한다", () => {
  it("양수는 적립식, 0·미지정은 거치식, 음수는 인출식", () => {
    expect(vrFormOf(250)).toBe("적립식");
    expect(vrFormOf(0)).toBe("거치식");
    expect(vrFormOf(undefined)).toBe("거치식");
    expect(vrFormOf(-200)).toBe("인출식");
  });
});

describe("defaultsForForm — 원문 7.1 표 그대로", () => {
  it("Pool 한도: 적립 75% · 거치 50% · 인출 25%", () => {
    expect(defaultsForForm(250).poolLimitPct).toBe(0.75);
    expect(defaultsForForm(0).poolLimitPct).toBe(0.5);
    expect(defaultsForForm(-200).poolLimitPct).toBe(0.25);
  });

  it("G 시작값: 적립·거치 10 · 인출 20", () => {
    expect(defaultsForForm(250).gradient).toBe(10);
    expect(defaultsForForm(0).gradient).toBe(10);
    expect(defaultsForForm(-200).gradient).toBe(20);
  });
});

describe("설정이 기본값을 이긴다 — 원문도 \"가이드일 뿐 선택 가능\"", () => {
  const bars = cand(Array(30).fill(100));

  it("적으면 그 값을 쓴다", () => {
    // 적립식이지만 한도를 0.3 으로 적었으면 0.3 이다.
    const r = runValueRebalancingBacktest(bars, { ...CFG, cashflow: 250, poolLimitPct: 0.3 });
    expect(r.trades.length).toBeGreaterThan(0); // 돌기만 하면 된다 — 값 확인은 아래 seedVR 로
    expect(seedVR({ ...CFG, cashflow: 250, poolLimitPct: 0.3 }, 100).buyBudget)
      .toBeCloseTo(0.3 * seedVR({ ...CFG, cashflow: 250, poolLimitPct: 0.3 }, 100).pool, 6);
  });

  it("안 적으면 형태에서 유도한다 — 적립식은 75%", () => {
    const cfg = { ...CFG, cashflow: 250, poolLimitPct: undefined };
    const s = seedVR(cfg, 100);
    expect(s.buyBudget).toBeCloseTo(0.75 * s.pool, 6);
  });

  it("안 적은 거치식은 50%", () => {
    const s = seedVR({ ...CFG, poolLimitPct: undefined }, 100);
    expect(s.buyBudget).toBeCloseTo(0.5 * s.pool, 6);
  });
});

// ── 실효평단 (#345) ──
describe("effectiveAvgPrice — (누적매수 − 누적매도) / 보유수량", () => {
  it("원문 예시: 100만원에 50개 → 30만원어치 10개 매도 → 40개, 1.75만원", () => {
    // 원문 4.2 그대로. 매도해도 명목평단(2만원)은 안 변하지만 실효평단은 내려간다.
    expect(effectiveAvgPrice({ cumBuy: 1_000_000, cumSell: 300_000, qty: 40 })).toBeCloseTo(17_500, 6);
  });

  it("수익 매도가 쌓이면 마이너스로 넘어간다 — 원금 ZERO 상태", () => {
    expect(effectiveAvgPrice({ cumBuy: 100, cumSell: 150, qty: 10 })).toBeLessThan(0);
  });

  it("보유가 0 이면 낼 수 없다", () => {
    expect(effectiveAvgPrice({ cumBuy: 100, cumSell: 50, qty: 0 })).toBeNull();
  });

  it("백테스트 결과에 실린다", () => {
    const r = runValueRebalancingBacktest(cand(Array(30).fill(100)), CFG);
    expect(r.effectiveAvg).not.toBeNull();
    expect(typeof r.effectiveAvg).toBe("number");
  });
});
