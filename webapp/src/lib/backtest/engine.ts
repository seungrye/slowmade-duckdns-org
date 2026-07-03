// 무한매수법 백테스트 엔진 — stock-automator-v2 backtest/engine.py 의 run_backtest() 포팅.
// 일봉을 하루씩 흘려보내며 generate() 신호를 단순 체결 모델로 채운다.
//   - 시장가 → 종가 체결.
//   - 매수 지정가/LOC → 당일 저가 <= 지정가면 체결.
//   - 매도 지정가 → 당일 고가 >= 지정가면 체결.
//   - 매도는 항상 전량 익절 후 사이클 리셋(보유·평단·회차 0).
// 수수료/슬리피지/현금제약 없음(원본과 동일한 근사).

import { generate } from "./infinite-buying";
import type { Bar, InfiniteConfig, Signal, BacktestResult, BtTrade, EquityPoint } from "./types";

function fill(sig: Signal, bar: Bar): number | null {
  if (sig.ordType === "market") return bar.close;
  if (sig.side === "buy") return bar.low <= sig.price ? sig.price : null;
  return bar.high >= sig.price ? sig.price : null;
}

export function runBacktest(bars: Bar[], cfg: InfiniteConfig): BacktestResult {
  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let holdingQty = 0;
  let costBasis = 0;
  let roundNo = 0;

  for (const bar of bars) {
    const avg = holdingQty ? costBasis / holdingQty : 0;
    const state = { price: bar.close, holdingQty, avgPrice: avg, roundNo };

    for (const sig of generate(state, cfg)) {
      const filled = fill(sig, bar);
      if (filled === null) continue;
      if (sig.side === "buy") {
        costBasis += filled * sig.qty;
        holdingQty += sig.qty;
        roundNo += 1;
        trades.push({ date: bar.date, side: "buy", price: filled, qty: sig.qty, pnl: 0, roundNo });
      } else {
        // 매도 = 전량 익절
        const pnl = (filled - avg) * holdingQty;
        trades.push({ date: bar.date, side: "sell", price: filled, qty: holdingQty, pnl, roundNo });
        holdingQty = 0;
        costBasis = 0;
        roundNo = 0;
      }
    }
    equityCurve.push({ date: bar.date, equity: holdingQty * bar.close });
  }

  const totalPnl = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.pnl, 0);
  return { trades, equityCurve, totalPnl };
}
