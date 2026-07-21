// 변동성 타깃 레버리지 — 레버리지 ETF 를 목표 변동성에 맞춰 부분 포지션으로 노출 조절.
// 노출 f = min(maxLeverage, targetVol / 실현변동성). 변동성이 치솟으면 노출↓(현금 확대) → 낙폭 완화.
// 시그널(1배 지수) 지정 시 SMA 레짐 이탈이면 f=0(현금). rotation 등과 달리 부분 포지션·일 리밸런스.

import { smaNewest } from "@/lib/trading/strategies";
import type { BacktestResult, BtTrade, EquityPoint, VolTargetV1Config } from "./types";
import type { RotationCandidate } from "./rotation";

/** 실현 연변동성 — 일간수익 모표준편차 × √252. 수익 2개 미만이면 null. */
export function realizedVol(dailyReturns: number[], tradingDays = 252): number | null {
  if (dailyReturns.length < 2) return null;
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((a, r) => a + (r - mean) ** 2, 0) / dailyReturns.length;
  return Math.sqrt(variance) * Math.sqrt(tradingDays);
}

/** 목표 노출 = min(maxLev, targetVol / 실현변동성). 실현변동성 0 이하면 maxLev. 0 이상. */
export function targetExposure(realizedVolAnn: number, targetVolAnn: number, maxLev: number): number {
  if (realizedVolAnn <= 0) return maxLev;
  return Math.max(0, Math.min(maxLev, targetVolAnn / realizedVolAnn));
}

/** 변동성 타깃 백테스트. target=레버리지 ETF, signal=선택 레짐 시그널(1배 지수). */
export function runVolTargetBacktest(
  target: RotationCandidate,
  cfg: VolTargetV1Config,
  signalBars?: { date: string; close: number }[],
): BacktestResult {
  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  const fee = cfg.feeRate && cfg.feeRate > 0 ? cfg.feeRate : 0;
  const targetVol = cfg.targetVolPct / 100;
  const band = cfg.bandPct ?? 0.01;
  const sigMap = signalBars ? new Map(signalBars.map((b) => [b.date, b.close])) : null;

  let cash = cfg.principal;
  let qty = 0;
  const rets: number[] = []; // 대상 일간수익
  let prevClose: number | null = null;
  const sigCloses: number[] = [];
  let regimeOn = true; // 시그널 있을 때만 갱신(히스테리시스)

  for (const bar of target.bars) {
    const date = bar.date;
    const price = bar.close;
    if (prevClose !== null && prevClose > 0) rets.push(price / prevClose - 1);
    prevClose = price;
    if (sigMap) { const sc = sigMap.get(date); if (sc !== undefined) sigCloses.push(sc); }

    const inRange = (!cfg.from || date >= cfg.from) && (!cfg.to || date <= cfg.to);
    if (!inRange) continue;

    // 레짐(선택): 시그널 SMA 히스테리시스
    if (sigMap && cfg.smaPeriod) {
      const ma = smaNewest([...sigCloses].reverse(), cfg.smaPeriod);
      const sc = sigCloses[sigCloses.length - 1];
      if (ma !== null && sc !== undefined) {
        if (sc > ma * (1 + band)) regimeOn = true;
        else if (sc < ma * (1 - band)) regimeOn = false;
      }
    }
    const rv = realizedVol(rets.slice(-cfg.volLookback));
    let f = rv === null ? 0 : targetExposure(rv, targetVol, cfg.maxLeverage);
    if (sigMap && cfg.smaPeriod && !regimeOn) f = 0;

    const equity = cash + qty * price;
    const curVal = qty * price;
    const targetVal = f * equity;
    // 드리프트가 밴드 초과일 때만 리밸런스(거래 절감)
    if (equity > 0 && Math.abs(targetVal - curVal) / equity > cfg.rebalanceBand) {
      const targetQty = price > 0 ? Math.floor(targetVal / price) : 0;
      const delta = targetQty - qty;
      if (delta > 0) { const cost = delta * price * (1 + fee); if (cost <= cash) { cash -= cost; qty += delta; trades.push({ date, side: "buy", price, qty: delta, pnl: 0, roundNo: 0, ticker: target.ticker }); } }
      else if (delta < 0) { const sellN = -delta; cash += sellN * price * (1 - fee); qty -= sellN; trades.push({ date, side: "sell", price, qty: sellN, pnl: 0, roundNo: 0, ticker: target.ticker }); }
    }
    equityCurve.push({ date, equity: cash + qty * price });
  }
  const totalPnl = equityCurve.length ? equityCurve[equityCurve.length - 1].equity - cfg.principal : 0;
  return { trades, equityCurve, totalPnl };
}
