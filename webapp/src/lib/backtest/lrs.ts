// Leveraged rotation v1 (LRS), from Michael Gayed's "Leverage for the Long Run" (2016).
//
// The idea: **the signal is the 200-day SMA of the 1x index (QQQ), while the trading happens in a leveraged ETF (TQQQ)**.
//   - Index close > index SMA x (1 + band) -> hold the leveraged ETF in full (3x exposure in an up regime)
//   - Index close < index SMA x (1 - band) -> go fully to cash (out of a down regime)
// An SMA on the leveraged ETF itself signals far too late because of 3x volatility (after a -50% drawdown) -
// the index SMA turns first, at around -10%, and that earlier exit is the whole point of the strategy.
// Backtest (QQQ signal, TQQQ traded, 2010-2026): about 6x the market's return (QQQ buy-and-hold), with an MDD of
// -55% against 3x buy-and-hold's -82%. In down markets (dot-com, the financial crisis, 2022) the 1x signal mostly moves it to cash.
//
// The signal's and the traded symbol's daily bars are aligned by date, and the signal's bars should reach further
// back than the trading range so the SMA can warm up (the site passes the whole history).

import { lrsDecide } from "@/lib/trading/strategies";
import type { BacktestResult, Bar, BtTrade, EquityPoint, LrsV1Config } from "./types";

// The backtest streams daily bars a day at a time and calls **the same decision function live uses** (lrsDecide) -
// one code path for backtest and live. This file only handles the fill model (filling at the close) and the equity curve.
export function runLrsBacktest(tradeBars: Bar[], signalBars: Bar[], cfg: LrsV1Config): BacktestResult {
  const sigByDate = new Map(signalBars.map((b) => [b.date, b.close]));
  // Warm up the SMA from the signal's closes before the trading start date (when the signal's history is longer).
  const firstTrade = tradeBars.length ? tradeBars[0].date : "";
  const sigCloses: number[] = signalBars.filter((b) => b.date < firstTrade).map((b) => b.close);

  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let holdingQty = 0;
  let costBasis = 0;
  let peak = 0;
  let cash = cfg.principal; // Compounding - the whole sale proceeds are reinvested on the next entry (the natural form of an all-in switching strategy)

  for (const bar of tradeBars) {
    const sc = sigByDate.get(bar.date);
    if (sc !== undefined) sigCloses.push(sc);
    if (sc !== undefined && sigCloses.length >= cfg.smaPeriod) {
      if (holdingQty > 0) peak = Math.max(peak, bar.close);
      const intents = lrsDecide({
        signalCloses: sigCloses.slice(-cfg.smaPeriod).reverse(), // 최신순 요구
        target: "", price: bar.close,
        holdingQty, avgPrice: holdingQty ? costBasis / holdingQty : 0, cash,
        smaPeriod: cfg.smaPeriod, bandPct: cfg.bandPct,
        trailPct: cfg.trailPct, peak: holdingQty > 0 ? peak : undefined,
      });
      for (const it of intents) {
        if (it.side === "buy") {
          costBasis = it.qty * bar.close;
          cash -= costBasis;
          holdingQty = it.qty;
          peak = bar.close;
          trades.push({ date: bar.date, side: "buy", price: bar.close, qty: it.qty, pnl: 0, roundNo: 0 });
        } else {
          const avg = costBasis / holdingQty;
          trades.push({ date: bar.date, side: "sell", price: bar.close, qty: holdingQty,
                        pnl: (bar.close - avg) * holdingQty, roundNo: 0 });
          cash += bar.close * holdingQty;
          holdingQty = 0;
          costBasis = 0;
          peak = 0;
        }
      }
    }
    equityCurve.push({ date: bar.date, equity: holdingQty * bar.close });
  }

  const totalPnl = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.pnl, 0);
  return { trades, equityCurve, totalPnl };
}
