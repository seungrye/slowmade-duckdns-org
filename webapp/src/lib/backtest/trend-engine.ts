// 추세추종 백테스트 엔진. 원본 backtest/engine.py 는 무한매수 전용(history 미설정)이라
// 추세추종은 못 돌린다 — 여기서 history(최신순 종가)를 채워 TrendFollowing.generate 를
// 흘려보낸다. 체결은 시장가=종가(추세추종은 시장가만 사용).

import { generate } from "./trend-following";
import type { Bar, TrendConfig, TrendState, BacktestResult, BtTrade, EquityPoint, Signal } from "./types";

export function runTrendBacktest(bars: Bar[], cfg: TrendConfig): BacktestResult {
  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let holdingQty = 0;
  let costBasis = 0;
  const closes: number[] = []; // 시간순 종가 누적

  const need = cfg.longMa + 1; // generate 에 필요한 최소 history 길이(장기MA + 어제 비교)
  for (const bar of bars) {
    closes.push(bar.close);
    const avg = holdingQty ? costBasis / holdingQty : 0;
    // 최근 need 개만 최신순으로 전달 — sma 는 앞 period 만 쓰므로 결과 동일(O(n^2) 회피).
    const recent = closes.slice(Math.max(0, closes.length - need));
    const history = recent.slice().reverse();
    const state = { price: bar.close, holdingQty, avgPrice: avg, history };

    for (const sig of generate(state, cfg)) {
      const filled = bar.close; // 시장가 → 종가 체결
      if (sig.side === "buy") {
        costBasis += filled * sig.qty;
        holdingQty += sig.qty;
        trades.push({ date: bar.date, side: "buy", price: filled, qty: sig.qty, pnl: 0, roundNo: 0 });
      } else {
        const pnl = (filled - avg) * holdingQty;
        trades.push({ date: bar.date, side: "sell", price: filled, qty: holdingQty, pnl, roundNo: 0 });
        holdingQty = 0;
        costBasis = 0;
      }
    }
    equityCurve.push({ date: bar.date, equity: holdingQty * bar.close });
  }

  const totalPnl = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.pnl, 0);
  return { trades, equityCurve, totalPnl };
}

/** 변형 전략(v2·v3·v4) 공용 러너 — generate 콜백과 필요한 history 길이를 주입한다.
 *  v1 러너와 동일한 체결 모델(시장가=종가)에 더해 보유 중 최고 종가(peak)를 추적해
 *  state 로 넘긴다(v4 트레일링 스탑 판정). v1 러너(runTrendBacktest)는 파이썬 대조
 *  검증본이라 건드리지 않는다. */
export function runTrendVariantBacktest(
  bars: Bar[],
  need: number, // generate 에 필요한 최소 history 길이
  gen: (state: TrendState) => Signal[],
): BacktestResult {
  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let holdingQty = 0;
  let costBasis = 0;
  let peak = 0; // 보유 중 최고 종가(매수 시 리셋, 청산 시 0)
  const closes: number[] = [];

  for (const bar of bars) {
    closes.push(bar.close);
    if (holdingQty > 0) peak = Math.max(peak, bar.close); // 오늘 종가 반영 후 신호 판정
    const avg = holdingQty ? costBasis / holdingQty : 0;
    const recent = closes.slice(Math.max(0, closes.length - need));
    const history = recent.slice().reverse();
    const state: TrendState = { price: bar.close, holdingQty, avgPrice: avg, history, peak };

    for (const sig of gen(state)) {
      const filled = bar.close; // 시장가 → 종가 체결
      if (sig.side === "buy") {
        costBasis += filled * sig.qty;
        holdingQty += sig.qty;
        peak = filled; // 진입 시점부터 고점 추적 시작
        trades.push({ date: bar.date, side: "buy", price: filled, qty: sig.qty, pnl: 0, roundNo: 0 });
      } else {
        const pnl = (filled - avg) * holdingQty;
        trades.push({ date: bar.date, side: "sell", price: filled, qty: holdingQty, pnl, roundNo: 0 });
        holdingQty = 0;
        costBasis = 0;
        peak = 0;
      }
    }
    equityCurve.push({ date: bar.date, equity: holdingQty * bar.close });
  }

  const totalPnl = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.pnl, 0);
  return { trades, equityCurve, totalPnl };
}
