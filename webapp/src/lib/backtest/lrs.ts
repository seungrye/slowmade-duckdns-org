// 레버리지 로테이션 v1 (LRS) — Michael Gayed, "Leverage for the Long Run" (2016).
//
// 핵심: **시그널은 1배 지수(예: QQQ)의 200일 SMA, 매매는 레버리지 ETF(예: TQQQ)**.
//   - 지수 종가 > 지수 SMA×(1+밴드) → 레버리지 ETF 전량 보유 (상승 레짐 3배 노출)
//   - 지수 종가 < 지수 SMA×(1-밴드) → 전량 현금 (하락 레짐 대피)
// 레버리지 ETF 자체 SMA 는 3배 변동성 때문에 이탈 신호가 너무 늦다(-50% 후 신호) —
// 지수 SMA 가 -10% 내외에서 먼저 꺾여 대피가 빠른 것이 이 전략의 요체.
// 백테스트(QQQ 시그널/TQQQ 매매, 2010~2026): 시장(QQQ B&H) 대비 수익 ~6배, MDD 는 3배
// B&H(-82%) 대비 -55% 수준. 하락장(닷컴·금융위기·2022)은 1배 기준 대부분 현금 대피.
//
// 시그널 종목과 매매 종목의 일봉을 날짜로 정렬하며, 시그널 SMA 워밍업을 위해 시그널
// 일봉은 매매 구간보다 과거까지 포함해 넘기는 것을 권장한다(사이트는 전체 이력 사용).

import type { BacktestResult, Bar, BtTrade, EquityPoint, LrsV1Config } from "./types";

export function runLrsBacktest(tradeBars: Bar[], signalBars: Bar[], cfg: LrsV1Config): BacktestResult {
  const sigByDate = new Map(signalBars.map((b) => [b.date, b.close]));
  // 매매 시작일 이전의 시그널 종가로 SMA 를 워밍업한다(시그널 이력이 더 길 때).
  const firstTrade = tradeBars.length ? tradeBars[0].date : "";
  const sigCloses: number[] = signalBars.filter((b) => b.date < firstTrade).map((b) => b.close);

  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let holdingQty = 0;
  let costBasis = 0;
  let peak = 0;
  let cash = cfg.principal; // 복리 — 매도 대금 전액을 다음 진입에 재투자(전량 스위칭 전략의 자연스러운 형태)

  const smaLast = (): number | null => {
    if (sigCloses.length < cfg.smaPeriod) return null;
    let s = 0;
    for (let i = sigCloses.length - cfg.smaPeriod; i < sigCloses.length; i++) s += sigCloses[i];
    return s / cfg.smaPeriod;
  };

  for (const bar of tradeBars) {
    const sc = sigByDate.get(bar.date);
    if (sc !== undefined) sigCloses.push(sc);
    const ma = smaLast();
    if (ma !== null && sc !== undefined) {
      if (holdingQty > 0) {
        peak = Math.max(peak, bar.close);
        const trailHit = cfg.trailPct > 0 && cfg.trailPct < 1 && bar.close <= peak * (1 - cfg.trailPct);
        if (sc < ma * (1 - cfg.bandPct) || trailHit) {
          const avg = costBasis / holdingQty;
          const pnl = (bar.close - avg) * holdingQty;
          trades.push({ date: bar.date, side: "sell", price: bar.close, qty: holdingQty, pnl, roundNo: 0 });
          cash += bar.close * holdingQty;
          holdingQty = 0;
          costBasis = 0;
          peak = 0;
        }
      } else if (sc > ma * (1 + cfg.bandPct)) {
        const qty = Math.floor(cash / bar.close);
        if (qty >= 1) {
          costBasis = qty * bar.close;
          cash -= costBasis;
          holdingQty = qty;
          peak = bar.close;
          trades.push({ date: bar.date, side: "buy", price: bar.close, qty, pnl: 0, roundNo: 0 });
        }
      }
    }
    equityCurve.push({ date: bar.date, equity: holdingQty * bar.close });
  }

  const totalPnl = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.pnl, 0);
  return { trades, equityCurve, totalPnl };
}
