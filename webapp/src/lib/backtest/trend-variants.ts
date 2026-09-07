// Trend-following variants v2, v3 and v4 - experimental versions that change v1's entry and exit rules
// (trend-following.ts, the 20/60 golden and dead cross). Pure functions, for the site's backtest only. Ported to Python once proven.
//
//   v2 (MA breakout)   : buy when the close breaks above a reference MA (20-day by default), liquidate when it falls below.
//                        Faster in and out than v1 - it catches the start of a trend but pays for whipsaw in a sideways market.
//   v3 (trend filter)  : enter on a golden cross only while the long MA is rising (today's long MA > that of slopeDays ago).
//                        It filters the false golden crosses that appear in bear-market rallies, raising the win rate. Exit is the dead cross.
//   v4 (trailing stop) : entry is v1's (a golden cross). Exit is the dead cross **or** a fall of trailPct (30% by default)
//                        from the highest close while held - limiting losses when a crash outruns the dead cross.

import { sma } from "./trend-following";
import type { Signal, TrendState, TrendV2Config, TrendV3Config, TrendV4Config } from "./types";

/** v2 - a price/moving-average breakout. */
export function generateV2(state: TrendState, cfg: TrendV2Config): Signal[] {
  const cl = state.history; // newest first (today = cl[0])
  const p = cfg.maPeriod;
  if (cl.length < p + 1) return []; // +1 so yesterday's MA can be compared

  const maT = sma(cl, p);
  const maY = sma(cl.slice(1), p); // as of yesterday
  if (maT === null || maY === null) return [];

  const above = state.price > maT;
  const aboveY = cl[1] > maY; // yesterday's close vs yesterday's MA

  if (state.holdingQty === 0 && above && !aboveY) {
    const qty = Math.floor(cfg.principal / state.price);
    if (qty >= 1) {
      return [{ side: "buy", qty, price: state.price, ordType: "market", reason: `${p}일선 상향 돌파 진입` }];
    }
  } else if (state.holdingQty > 0 && !above) {
    // The exit is a state, not a crossing event (close <= MA) - so it always liquidates even if the breakdown day was missed.
    return [{ side: "sell", qty: state.holdingQty, price: state.price, ordType: "market", reason: `${p}일선 이탈 청산` }];
  }
  return [];
}

/** v3 - a golden cross with a long-MA slope filter on top. */
export function generateV3(state: TrendState, cfg: TrendV3Config): Signal[] {
  const cl = state.history;
  const s = cfg.shortMa;
  const lng = cfg.longMa;
  const k = cfg.slopeDays;
  if (cl.length < lng + k + 1) return []; // the slope comparison (the long MA k days ago) plus yesterday's crossing comparison

  const st = sma(cl, s);
  const lt = sma(cl, lng);
  const sy = sma(cl.slice(1), s);
  const ly = sma(cl.slice(1), lng);
  const ltPast = sma(cl.slice(k), lng); // the long MA k days ago
  if (st === null || lt === null || sy === null || ly === null || ltPast === null) return [];

  const golden = st > lt;
  const goldenY = sy > ly;
  const rising = lt > ltPast; // enter only while the long-term trend is rising

  if (state.holdingQty === 0 && golden && !goldenY && rising) {
    const qty = Math.floor(cfg.principal / state.price);
    if (qty >= 1) {
      return [{ side: "buy", qty, price: state.price, ordType: "market", reason: `골든크로스+${lng}MA 상승 진입` }];
    }
  } else if (state.holdingQty > 0 && !golden) {
    return [{ side: "sell", qty: state.holdingQty, price: state.price, ordType: "market", reason: `데드크로스 청산(${s}MA<=${lng}MA)` }];
  }
  return [];
}

/** v4 - a golden-cross entry, exiting on a dead cross or a fall of trailPct from the high. */
export function generateV4(state: TrendState, cfg: TrendV4Config): Signal[] {
  const cl = state.history;
  const s = cfg.shortMa;
  const lng = cfg.longMa;
  if (cl.length < lng + 1) return [];

  const st = sma(cl, s);
  const lt = sma(cl, lng);
  const sy = sma(cl.slice(1), s);
  const ly = sma(cl.slice(1), lng);
  if (st === null || lt === null || sy === null || ly === null) return [];

  const golden = st > lt;
  const goldenY = sy > ly;

  if (state.holdingQty === 0 && golden && !goldenY) {
    const qty = Math.floor(cfg.principal / state.price);
    if (qty >= 1) {
      return [{ side: "buy", qty, price: state.price, ordType: "market", reason: `골든크로스 진입(${s}MA>${lng}MA)` }];
    }
  } else if (state.holdingQty > 0) {
    const peak = state.peak ?? 0;
    // The trailing stop is checked before the dead cross - on a crash, the stop is meant to fire first.
    if (peak > 0 && state.price <= peak * (1 - cfg.trailPct)) {
      return [{ side: "sell", qty: state.holdingQty, price: state.price, ordType: "market",
                reason: `트레일링 스탑 청산(고점 ${peak.toFixed(2)} 대비 -${(cfg.trailPct * 100).toFixed(0)}%)` }];
    }
    if (!golden) {
      return [{ side: "sell", qty: state.holdingQty, price: state.price, ordType: "market", reason: `데드크로스 청산(${s}MA<=${lng}MA)` }];
    }
  }
  return [];
}
