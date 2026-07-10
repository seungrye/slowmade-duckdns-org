// 추세추종 변형 전략 v2·v3·v4 — v1(trend-following.ts, 20/60 골든·데드크로스)의 진입/청산
// 규칙을 바꾼 실험 버전들. 순수 함수(사이트 백테스트 전용). 검증되면 파이썬으로 포팅한다.
//
//   v2 (MA 돌파)      : 종가가 기준 MA(기본 20일선)를 상향 돌파하면 매수, MA 아래로 내려오면 전량 청산.
//                       v1 보다 빠른 진입/청산 — 추세 초입을 잡지만 횡보장 잦은 매매(whipsaw) 비용.
//   v3 (추세 필터)    : 골든크로스 + 장기MA 가 상승 중(오늘 장기MA > slopeDays 일 전)일 때만 진입.
//                       하락장 반등에서 나오는 가짜 골든크로스를 걸러 승률을 높인다. 청산은 데드크로스.
//   v4 (트레일링 스탑): 진입은 v1 과 동일(골든크로스). 청산은 데드크로스 **또는** 보유 중 최고 종가
//                       대비 trailPct(기본 30%) 하락 — 데드크로스가 늦는 급락장에서 손실을 제한한다.

import { sma } from "./trend-following";
import type { Signal, TrendState, TrendV2Config, TrendV3Config, TrendV4Config } from "./types";

/** v2 — 가격/이동평균선 돌파. */
export function generateV2(state: TrendState, cfg: TrendV2Config): Signal[] {
  const cl = state.history; // 최신순 (오늘=cl[0])
  const p = cfg.maPeriod;
  if (cl.length < p + 1) return []; // 어제 MA 비교를 위해 +1

  const maT = sma(cl, p);
  const maY = sma(cl.slice(1), p); // 어제 기준
  if (maT === null || maY === null) return [];

  const above = state.price > maT;
  const aboveY = cl[1] > maY; // 어제 종가 vs 어제 MA

  if (state.holdingQty === 0 && above && !aboveY) {
    const qty = Math.floor(cfg.principal / state.price);
    if (qty >= 1) {
      return [{ side: "buy", qty, price: state.price, ordType: "market", reason: `${p}일선 상향 돌파 진입` }];
    }
  } else if (state.holdingQty > 0 && !above) {
    // 청산은 크로스 이벤트가 아니라 상태 기준(종가 ≤ MA) — 돌파일을 놓쳐도 반드시 청산된다.
    return [{ side: "sell", qty: state.holdingQty, price: state.price, ordType: "market", reason: `${p}일선 이탈 청산` }];
  }
  return [];
}

/** v3 — 장기MA 상승(기울기) 필터를 얹은 골든크로스. */
export function generateV3(state: TrendState, cfg: TrendV3Config): Signal[] {
  const cl = state.history;
  const s = cfg.shortMa;
  const lng = cfg.longMa;
  const k = cfg.slopeDays;
  if (cl.length < lng + k + 1) return []; // 기울기 비교(k일 전 장기MA) + 어제 크로스 비교

  const st = sma(cl, s);
  const lt = sma(cl, lng);
  const sy = sma(cl.slice(1), s);
  const ly = sma(cl.slice(1), lng);
  const ltPast = sma(cl.slice(k), lng); // k일 전 장기MA
  if (st === null || lt === null || sy === null || ly === null || ltPast === null) return [];

  const golden = st > lt;
  const goldenY = sy > ly;
  const rising = lt > ltPast; // 장기 추세가 상승 중일 때만 진입

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

/** v4 — 골든크로스 진입 + (데드크로스 ∨ 고점 대비 trailPct 하락) 청산. */
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
    // 트레일링 스탑을 데드크로스보다 먼저 본다 — 급락은 크로스보다 스탑이 먼저 잡는 게 의도.
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
