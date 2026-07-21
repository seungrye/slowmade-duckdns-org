// 듀얼 모멘텀(GEM, Gary Antonacci) — 상대 모멘텀(후보 중 1위) + 절대 모멘텀(1위가 방어자산보다
// 강할 때만 보유, 아니면 방어자산 대피). 재평가주기마다 판정, 전량 in/out(1종목), 복리.
// rotation 과 달리 SMA 레짐 필터가 없고, "현금" 대신 채권 등 방어자산을 든다.

import { momentum, compositeMomentum } from "@/lib/trading/strategies";
import type { BacktestResult, BtTrade, EquityPoint, DualMomentumV1Config } from "./types";
import type { RotationCandidate } from "./rotation";

/** 순수 결정: 상대모멘텀 1위 vs 방어자산 절대모멘텀. target 은 후보 또는 방어자산 티커. */
export function dualMomentumDecide(args: {
  candidates: string[];
  candMom: Record<string, number | null>;
  defensiveTicker: string;
  defensiveMom: number | null;
}): { target: string; reason: string } {
  let best: string | null = null;
  let bestMom = -Infinity;
  for (const s of args.candidates) {
    const m = args.candMom[s];
    if (m !== null && m !== undefined && m > bestMom) { best = s; bestMom = m; }
  }
  const defMom = args.defensiveMom ?? -Infinity;
  if (best === null) return { target: args.defensiveTicker, reason: "후보 모멘텀 데이터 부족 → 방어자산" };
  if (bestMom <= defMom) {
    return { target: args.defensiveTicker,
             reason: `절대모멘텀 약함(1위 ${(bestMom * 100).toFixed(1)}% ≤ 방어 ${(defMom * 100).toFixed(1)}%) → ${args.defensiveTicker}` };
  }
  return { target: best, reason: `상대모멘텀 1위 ${best} (${(bestMom * 100).toFixed(1)}%)` };
}

/** 듀얼 모멘텀 백테스트. candidates=위험자산, defensive=방어자산(채권 등). 시간축은 방어자산 일봉. */
export function runDualMomentumBacktest(
  candidates: RotationCandidate[],
  defensive: RotationCandidate,
  cfg: DualMomentumV1Config,
): BacktestResult {
  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  const fee = cfg.feeRate && cfg.feeRate > 0 ? cfg.feeRate : 0;
  const all = [...candidates, defensive];
  const closeMaps = all.map((c) => new Map(c.bars.map((b) => [b.date, b.close])));
  const series: number[][] = all.map(() => []); // 자산별 시간순 종가 축적
  const idxOf = new Map(all.map((c, i) => [c.ticker, i]));
  const need = cfg.momLookbacks && cfg.momLookbacks.length ? Math.max(...cfg.momLookbacks) : cfg.momDays;
  const momOf = (i: number): number | null => {
    const closes = series[i].slice(-(need + 1)).reverse();
    return cfg.momLookbacks && cfg.momLookbacks.length ? compositeMomentum(closes, cfg.momLookbacks) : momentum(closes, cfg.momDays);
  };

  let cash = cfg.principal;
  let held: string | null = null; // 보유 티커
  let qty = 0;
  let avg = 0;
  let sinceReb = 0;

  const sell = (date: string, price: number) => {
    trades.push({ date, side: "sell", price, qty, pnl: (price - avg) * qty, roundNo: 0, ticker: held! });
    cash += price * qty * (1 - fee);
    held = null; qty = 0; avg = 0;
  };
  const buy = (date: string, ticker: string, price: number) => {
    const q = Math.floor(cash / (price * (1 + fee)));
    if (q < 1) return;
    trades.push({ date, side: "buy", price, qty: q, pnl: 0, roundNo: 0, ticker });
    cash -= price * q * (1 + fee);
    held = ticker; qty = q; avg = price;
  };

  for (const bar of defensive.bars) {
    const date = bar.date;
    for (let i = 0; i < all.length; i++) { const c = closeMaps[i].get(date); if (c !== undefined) series[i].push(c); }
    const inRange = (!cfg.from || date >= cfg.from) && (!cfg.to || date <= cfg.to);
    if (!inRange) continue;

    if (held !== null) sinceReb++;
    if (held === null || sinceReb >= cfg.rebalanceDays) {
      const candMom: Record<string, number | null> = {};
      for (const c of candidates) candMom[c.ticker] = momOf(idxOf.get(c.ticker)!);
      const defMom = momOf(idxOf.get(defensive.ticker)!);
      const dec = dualMomentumDecide({ candidates: candidates.map((c) => c.ticker), candMom, defensiveTicker: defensive.ticker, defensiveMom: defMom });
      const tp = closeMaps[idxOf.get(dec.target)!].get(date);
      const heldClose = held !== null ? closeMaps[idxOf.get(held)!].get(date) : undefined;
      if (tp !== undefined && (held === null || heldClose !== undefined)) {
        if (dec.target !== held) {
          if (held !== null && heldClose !== undefined) sell(date, heldClose);
          buy(date, dec.target, tp);
        }
        sinceReb = 0;
      }
    }
    const cur = held !== null ? closeMaps[idxOf.get(held)!].get(date) : undefined;
    equityCurve.push({ date, equity: cash + (cur !== undefined ? qty * cur : qty * avg) });
  }
  const totalPnl = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.pnl, 0);
  return { trades, equityCurve, totalPnl };
}
