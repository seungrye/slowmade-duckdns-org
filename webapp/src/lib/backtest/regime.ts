// 레짐 모멘텀 v1 — 장기 이동평균 레짐 필터 + 절대 모멘텀 (단일 종목·롱 온리·현금 대피).
//
// 근거 문헌:
//   - Meb Faber, "A Quantitative Approach to Tactical Asset Allocation" (2007) — 장기 SMA(10개월
//     ≈ 200일) 위에서만 보유하는 타이밍이 수익은 유지하며 MDD 를 절반 이하로 줄인다.
//   - Gary Antonacci, "Dual Momentum" — 절대 모멘텀(과거 수익률 > 0 일 때만 보유)이 하락장 방어.
// 조합 규칙:
//   진입(현금): 종가 > SMA(smaPeriod) × (1+bandPct)  AND  종가 ≥ momDays 일 전 종가
//   청산(보유): 종가 < SMA(smaPeriod) × (1−bandPct)  OR  종가 ≤ 보유 중 고점 × (1−trailPct)
//   - 밴드(히스테리시스)가 SMA 부근 왕복 매매(whipsaw)를 줄인다.
//   - 상태 기반 진입이라 트레일링 스탑 후에도 레짐·모멘텀이 살아 있으면 자동 재진입한다.
//   - 레버리지 ETF(TQQQ 등)에 얹으면 상승 레짐만 3배 노출 + 하락 레짐 현금 — 이 전략의 의도.

import { sma } from "./trend-following";
import type { RegimeV1Config, Signal, TrendState } from "./types";

export function generateRegimeV1(state: TrendState, cfg: RegimeV1Config): Signal[] {
  const cl = state.history; // 최신순 (오늘=cl[0])
  const need = Math.max(cfg.smaPeriod, cfg.momDays + 1);
  if (cl.length < need) return [];

  const ma = sma(cl, cfg.smaPeriod);
  if (ma === null) return [];
  const momBase = cl[cfg.momDays]; // momDays 일 전 종가

  if (state.holdingQty === 0) {
    const regimeUp = state.price > ma * (1 + cfg.bandPct);
    const momentumUp = state.price >= momBase;
    if (regimeUp && momentumUp) {
      const qty = Math.floor(cfg.principal / state.price);
      if (qty >= 1) {
        return [{ side: "buy", qty, price: state.price, ordType: "market",
                  reason: `레짐 진입(>${cfg.smaPeriod}SMA+${(cfg.bandPct * 100).toFixed(0)}% & ${cfg.momDays}일 모멘텀)` }];
      }
    }
  } else {
    const peak = state.peak ?? 0;
    if (peak > 0 && state.price <= peak * (1 - cfg.trailPct)) {
      return [{ side: "sell", qty: state.holdingQty, price: state.price, ordType: "market",
                reason: `트레일링 스탑 청산(고점 ${peak.toFixed(2)} 대비 -${(cfg.trailPct * 100).toFixed(0)}%)` }];
    }
    if (state.price < ma * (1 - cfg.bandPct)) {
      return [{ side: "sell", qty: state.holdingQty, price: state.price, ordType: "market",
                reason: `레짐 이탈 청산(<${cfg.smaPeriod}SMA-${(cfg.bandPct * 100).toFixed(0)}%)` }];
    }
  }
  return [];
}
