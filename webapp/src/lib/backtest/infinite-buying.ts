// 라오어 무한매수법 — stock-automator-v2 strategy/infinite_buying.py 의 generate() 포팅.
// 순수 함수(부수효과 없음). 원본과 동일한 규칙:
//   - 1회차: 시장가 진입(하루예산으로 2주 미만이면 보류).
//   - 2회차부터: 하루 매수액을 절반씩 — 평단 LOC 50% + 현재가+프리미엄 LOC 50%.
//   - 보유분은 항상 평단+익절% 전량 지정가 매도.
//   - 원금 소진(roundNo>=splits) 후 매수 중단.

import type { InfiniteConfig, MarketState, Signal } from "./types";

export const MIN_FIRST_SHARES = 2; // 1회차 최소 매수 주수
export const DEFAULT_SPLITS = 40;
export const DEFAULT_TAKE_PROFIT_PCT = 0.1;
export const DEFAULT_LOC_PREMIUM_PCT = 0.12;

// 원본 파이썬 round(x, 2) 재현. 대부분은 엔진의 정확한 십진 반올림(toFixed)이 파이썬과
// 일치하지만, 정확히 .xx5 tie 는 toFixed 가 half-up(→위), 파이썬은 half-to-even(짝수쪽)이라
// 어긋난다. tie 만 감지해 짝수쪽으로 보정한다.
function round2(x: number): number {
  // 참값을 15자리까지 펼쳐 3번째 소수 이하를 본다. 정확히 "5" 뒤가 전부 0 인 이진-정확한
  // .xx5 만 진짜 tie → 파이썬처럼 half-to-even. 그 외(예 32.725=float상 미세 위)는
  // 3번째 이하가 5000..1 등으로 드러나므로 toFixed(2) 가 파이썬과 같은 방향으로 반올림한다.
  const dec = x.toFixed(17).split(".")[1] ?? "";
  const isTie = dec[2] === "5" && /^0*$/.test(dec.slice(3));
  if (isTie) {
    const twoDigit = Math.floor(x * 100); // .xx5 의 정수부(xx) — 32.125*100=3212.5 는 정확
    const even = twoDigit % 2 === 0 ? twoDigit : twoDigit + 1;
    return even / 100;
  }
  return Number(x.toFixed(2));
}
const qtyFor = (budget: number, price: number) => (price <= 0 ? 0 : Math.floor(budget / price));

export function dailyBudget(cfg: InfiniteConfig): number {
  return cfg.principal / cfg.splits;
}

export function generate(state: MarketState, cfg: InfiniteConfig): Signal[] {
  const signals: Signal[] = [];
  const budget = dailyBudget(cfg);

  // 1) 보유분이 있으면 항상 평단 +목표% 전량 매도.
  if (state.holdingQty > 0 && state.avgPrice > 0) {
    const target = round2(state.avgPrice * (1 + cfg.takeProfitPct));
    signals.push({
      side: "sell",
      qty: state.holdingQty,
      price: target,
      ordType: "limit",
      reason: `평단 ${state.avgPrice.toFixed(2)} +${(cfg.takeProfitPct * 100).toFixed(0)}% 익절`,
    });
  }

  // 2) 원금 소진 후 추가 매수하지 않는다.
  if (state.roundNo >= cfg.splits) return signals;

  // 3) 매수 신호.
  if (state.roundNo === 0) {
    const qty = qtyFor(budget, state.price);
    if (qty >= MIN_FIRST_SHARES) {
      signals.push({ side: "buy", qty, price: state.price, ordType: "market", reason: "1회차 시장가 진입" });
    }
  } else {
    const half = budget / 2;
    const avg = state.avgPrice || state.price;
    const avgQty = qtyFor(half, avg);
    const locPrice = round2(state.price * (1 + cfg.locPremiumPct));
    const locQty = qtyFor(half, state.price);
    if (avgQty > 0) {
      signals.push({
        side: "buy",
        qty: avgQty,
        price: round2(avg),
        ordType: "loc",
        reason: `${state.roundNo + 1}회차 평단가 LOC 매수`,
      });
    }
    if (locQty > 0) {
      signals.push({
        side: "buy",
        qty: locQty,
        price: locPrice,
        ordType: "loc",
        reason: `${state.roundNo + 1}회차 +${(cfg.locPremiumPct * 100).toFixed(0)}% LOC 매수`,
      });
    }
  }
  return signals;
}
