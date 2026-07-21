// 라오어 밸류리밸런싱(VR) — 단일 레버리지 ETF를 목표 경로 V의 밴드(±b) 안으로 유지하는 밸류애버리징.
// 계좌 = 주식(평가금 = qty×가격) + Pool(현금). 사이클(2주)마다 V₂=V₁+Pool/G+CF, 밴드 재계산.
// 매일 밴드 이탈 시 밴드 경계까지 리밸런스(하단 아래→매수·상단 위→매도). 평단 무관(가격만 사용).
// 적립(CF>0)/거치(CF=0)/인출(CF<0) 지원. 실력공식(V 하락 꺾임)은 문서상 수식 미공개 → 훅만 예약.

import type { BacktestResult, BtTrade, EquityPoint, ValueRebalancingConfig } from "./types";
import type { RotationCandidate } from "./rotation";

/** 기본공식 V 갱신: V₂ = V₁ + Pool/G + CF. (Pool 은 CF 반영 전 값 — 원문 예시 9000+1000/10+250=9350)
 *  실력공식(Pool≈0 에서 V 아래로 꺾임)은 문서상 수식 미공개라 여기 자리만 예약(교체 훅). */
export function updateVBasic(v1: number, pool: number, gradient: number, cf: number): number {
  return v1 + (gradient > 0 ? pool / gradient : 0) + cf;
}

/** 밴드 [하단, 상단] = [V(1−b), V(1+b)]. */
export function bandOf(v: number, b: number): { low: number; high: number } {
  return { low: v * (1 - b), high: v * (1 + b) };
}

/** 평가금(qty×price)을 밴드로 되돌리는 매매 수량(양수=매수·음수=매도·0=무행동).
 *  - 평가금 < low → 매수해 평가금을 하단까지(정수 주). 매수는 buyBudget(사이클 한도 잔량)·pool 로 제한.
 *  - 평가금 > high → 매도해 평가금을 상단까지(제한 없음 — 매도는 항상 허용).
 *  fee 는 매수여력 판정에만 반영(price×(1+fee)). 실제 대금/대차는 호출측이 처리. */
export function rebalanceShares(args: {
  qty: number; price: number; low: number; high: number; buyBudget: number; pool: number; fee: number;
}): number {
  const { qty, price, low, high, buyBudget, pool, fee } = args;
  if (price <= 0) return 0;
  const val = qty * price;
  if (val < low) {
    const wantUp = Math.floor((low - val) / price); // 하단까지 필요한 주수
    const byBudget = Math.floor(buyBudget / (price * (1 + fee)));
    const byPool = Math.floor(pool / (price * (1 + fee)));
    return Math.max(0, Math.min(wantUp, byBudget, byPool));
  }
  if (val > high) {
    const wantDown = Math.floor((val - high) / price); // 상단까지 팔 주수
    return -Math.min(wantDown, qty);
  }
  return 0;
}

/** VR 백테스트. target=대상 ETF(단일). 매매 구간은 from/to. */
export function runValueRebalancingBacktest(target: RotationCandidate, cfg: ValueRebalancingConfig): BacktestResult {
  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  const poolLog: string[] = [];
  const contributions: { date: string; amount: number }[] = [];
  const fee = cfg.feeRate && cfg.feeRate > 0 ? cfg.feeRate : 0;
  const b = cfg.bandPct;
  const G = cfg.gradient;
  const u = cfg.poolLimitPct;
  const cycleDays = Math.max(1, Math.floor(cfg.cycleDays));
  const cf = cfg.cashflow ?? 0;
  const initStock = cfg.initStockRatio ?? 0.85;
  const tk = target.ticker;

  const bars = target.bars.filter((bar) => (!cfg.from || bar.date >= cfg.from) && (!cfg.to || bar.date <= cfg.to) && bar.close > 0);
  if (bars.length === 0) return { trades, equityCurve, totalPnl: 0 };

  // ── 초기 진입: principal 을 주식:Pool 로 분할, 첫 V = 매수 직후 평가금 ──
  const p0 = bars[0].close;
  let qty = Math.floor((cfg.principal * initStock) / (p0 * (1 + fee)));
  let cumBuy = qty * p0 * (1 + fee);
  let cumSell = 0;
  let pool = cfg.principal - cumBuy;
  let V = qty * p0;
  if (qty >= 1) trades.push({ date: bars[0].date, side: "buy", price: p0, qty, pnl: 0, roundNo: 0, ticker: tk });

  let band = bandOf(V, b);
  let buyBudget = u * pool; // 사이클 매수 한도 잔량
  let sinceCycle = 0;

  const buy = (date: string, price: number, n: number) => {
    const cost = n * price * (1 + fee);
    pool -= cost; cumBuy += cost; buyBudget -= cost; qty += n;
    trades.push({ date, side: "buy", price, qty: n, pnl: 0, roundNo: 0, ticker: tk });
  };
  const sell = (date: string, price: number, n: number) => {
    const proceeds = n * price * (1 - fee);
    pool += proceeds; cumSell += proceeds; qty -= n;
    trades.push({ date, side: "sell", price, qty: n, pnl: 0, roundNo: 0, ticker: tk });
  };

  for (let i = 0; i < bars.length; i++) {
    const date = bars[i].date;
    const price = bars[i].close;

    // 사이클 경계(첫 바 제외): CF 적용 + V 갱신 + 밴드/예산 리셋
    if (i > 0 && sinceCycle >= cycleDays) {
      // 인출(CF<0)이 Pool 로 부족하면 주식 매도로 충당(Pool ≥ 0 불변식)
      if (cf < 0 && pool + cf < 0 && price > 0) {
        const need = -(pool + cf);
        const sellQ = Math.min(qty, Math.ceil(need / (price * (1 - fee))));
        if (sellQ > 0) sell(date, price, sellQ);
      }
      const poolBeforeCf = pool; // V 공식은 CF 반영 전 Pool 사용(원문 예시)
      V = updateVBasic(V, poolBeforeCf, G, cf);
      if (cf !== 0) { pool = Math.max(0, pool + cf); contributions.push({ date, amount: cf }); }
      // 존버모드 감지: Pool 이 1주도 못 살 만큼 소진 → V 정체(기본공식 한계)
      if (pool < price) poolLog.push(`${date} 존버모드 경보: Pool 소진(${pool.toFixed(0)}) — 기본공식 V 정체`);
      band = bandOf(V, b);
      buyBudget = u * pool;
      sinceCycle = 0;
    }

    // 매일 밴드 판정 매매
    const delta = rebalanceShares({ qty, price, low: band.low, high: band.high, buyBudget, pool, fee });
    if (delta > 0) buy(date, price, delta);
    else if (delta < 0) sell(date, price, -delta);

    equityCurve.push({ date, equity: qty * price + pool });
    sinceCycle++;
  }

  void cumBuy; void cumSell; // 실효평단 리포팅용 축적(현재 결과 스키마엔 미노출)
  const invested = cf !== 0 ? cfg.principal + contributions.reduce((s, c) => s + c.amount, 0) : cfg.principal;
  const totalPnl = equityCurve.length ? equityCurve[equityCurve.length - 1].equity - invested : 0;
  return {
    trades, equityCurve, totalPnl,
    ...(poolLog.length ? { poolLog } : {}),
    ...(cf !== 0 ? { contributions, totalContributed: invested } : {}),
  };
}
