// 무한매수법 V4.0 — 라오어 공식 방법론(카페 원문 1.일반모드 / 2.소진후 리버스모드) 기반 구현.
// (사용자 제공 원문 PDF 대조 — 개인 백테스트 용도)
//
// 일반모드:
//   - T(Turn): 1회분 매수 +1 · 절반 +0.5 (구현은 체결액/1회액 가산으로 일반화),
//     쿼터매도(별지점 LOC) 체결 시 T×0.75, 75% 지정가매도 체결 시 T×0.25.
//   - 별% = 15 − (30/분할수)×T (TQQQ: 20분할 15−1.5T, 40분할 15−0.75T). 별지점 = 평단×(1+별%).
//   - 1회매수금 = 잔금 / (분할수 − T) — T 소수 그대로, 매일 미세 변동.
//   - 첫 매수: 새 사이클 "다음날" 전일종가+10% LOC(급등 미체결 시 다음날 재시도).
//   - 전반전(T<분할/2): 절반 별지점 LOC + 절반 평단 LOC + 아래로 사다리 LOC(급락 대비).
//     후반전: 1회분 전체 별지점 LOC(별% 음수 → 평단 아래) + 사다리.
//     사다리는 "급락일에 1회매수액을 다 쓰기 위한" 장치 → 종가 체결 모델에서는
//     기존 매수 체결 후 남은 1회매수액을 종가로 추가 매수하는 것으로 근사.
//   - 매도(전·후반 공통, 매일): 보유 1/4 별지점 LOC + 3/4 평단+15% 지정가(TQQQ 기준).
//   - 종료: 보유 0 → 새 사이클(복리 — 잔금에 수익 포함해 재시작. 원문은 복리/단리 선택).
//
// 소진후 리버스모드 (T > 분할수−1):
//   - 첫날: 보유수량/(분할수/2) 내림 MOC 매도(무조건), 매수 없음.
//   - 이후 매일: 별지점R = "직전 5거래일 종가 평균".
//     매도: 직전보유/(분할수/2) 내림, 별지점R 위 LOC. 체결 시 T×0.9(20분할)/0.95(40분할).
//     매수(쿼터매수): 잔금/4 금액을 별지점R 아래 LOC. 체결 시 T += (분할수−T)×0.25.
//   - 종료: 종가 > 평단×(1−15%) 확인 후 "다음날부터" 일반모드 복귀(T 그대로 연결).
//     복귀 후 다시 T가 1회분 미만 남으면 재차 리버스모드.

import type { BacktestResult, Bar, BtTrade, EquityPoint } from "./types";

export interface InfiniteV4Config {
  principal: number;
  splits: number; // 20/30/40 (원문 추천). 별%·T 감쇠율이 분할수에 연동된다.
}

export function runInfiniteV4Backtest(bars: Bar[], cfg: InfiniteV4Config): BacktestResult {
  const { principal, splits } = cfg;
  const STAR_BASE = 15; // TQQQ 기준(SOXL 은 20 — 필요 시 파라미터화)
  const SELL_TARGET = 0.15; // 75% 지정가매도 +15% (TQQQ)
  const REV_DIVISOR = splits / 2; // 리버스 매도 등분(20분할→10, 40분할→20)
  const REV_SELL_DECAY = splits === 20 ? 0.9 : 0.95; // 리버스 매도 시 T 감쇠
  const RECOVER_PCT = 0.15; // 리버스 종료: 종가 > 평단×(1−15%) (TQQQ)

  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let qty = 0;
  let avg = 0;
  let T = 0;
  let cash = principal; // 잔금(복리 — 사이클 종료 후에도 유지)
  let mode: "normal" | "reverse" = "normal";
  let reverseFirstDay = false;
  let recoverConfirmed = false; // 리버스 종료조건 확인 → 다음날 일반모드 복귀
  let entryLimit: number | null = null; // 첫 매수 LOC(전일종가+10%). null 이면 오늘 주문 없음.
  const closes: number[] = []; // 시간순 종가(리버스 별지점 = 직전 5일 평균)

  const starPct = (t: number) => (STAR_BASE - (2 * STAR_BASE * t) / splits) / 100;
  const push = (side: "buy" | "sell", bar: Bar, q: number, price: number, pnl = 0) =>
    trades.push({ date: bar.date, side, price, qty: q, pnl, roundNo: Math.round(T * 100) / 100 });

  const buyFill = (bar: Bar, q: number, price: number) => {
    const cost = price * q;
    avg = qty + q > 0 ? (avg * qty + cost) / (qty + q) : price;
    qty += q;
    cash -= cost;
    return cost;
  };

  for (const bar of bars) {
    const prev5 = closes.slice(-5); // 오늘 제외 직전 5거래일
    closes.push(bar.close);

    // ── 리버스 → 일반모드 복귀(전일 회복 확인 시 오늘부터) ──
    if (mode === "reverse" && recoverConfirmed) {
      mode = "normal";
      recoverConfirmed = false;
    }

    if (qty === 0 && mode === "normal") {
      // ── 새 사이클: 오늘은 계획만(다음날 전일종가+10% LOC 로 첫 매수) ──
      if (entryLimit === null) {
        entryLimit = bar.close * 1.10;
      } else if (bar.close <= entryLimit) {
        const one = cash / splits;
        const q = Math.floor(one / entryLimit); // 실제 LOC 는 주문 시 지정가 기준 수량(종가 미지)
        if (q >= 1) {
          buyFill(bar, q, bar.close);
          T = 1;
          push("buy", bar, q, bar.close);
          entryLimit = null;
        }
      } else {
        entryLimit = bar.close * 1.10; // 10%+ 급등으로 미체결 → 기준 갱신해 재시도
      }
      equityCurve.push({ date: bar.date, equity: qty * bar.close });
      continue;
    }

    if (mode === "normal") {
      const star = starPct(T);
      const starPoint = avg * (1 + star);
      const one = cash / Math.max(0.5, splits - T); // 잔금/(분할수−T), T 소수 그대로

      // ── 매도(매일): 1/4 별지점 LOC + 3/4 +15% 지정가 ──
      const q25 = Math.floor(qty / 4);
      const q75 = qty - q25;
      let soldLimit = false;
      let soldQuarter = false;
      if (q75 >= 1 && bar.high >= avg * (1 + SELL_TARGET)) {
        const price = avg * (1 + SELL_TARGET);
        push("sell", bar, q75, price, (price - avg) * q75);
        qty -= q75;
        cash += price * q75;
        soldLimit = true;
      }
      if (q25 >= 1 && bar.close >= starPoint) {
        push("sell", bar, q25, bar.close, (bar.close - avg) * q25);
        qty -= q25;
        cash += bar.close * q25;
        soldQuarter = true;
      }
      if (qty === 0) {
        // 사이클 종료(복리) — 다음날부터 새 사이클 준비
        avg = 0;
        T = 0;
        entryLimit = null;
        equityCurve.push({ date: bar.date, equity: 0 });
        continue;
      }
      if (soldLimit) T *= 0.25; // 75% 지정가매도 후 잔존 → ×0.25 (원문 T 정의 (4))
      else if (soldQuarter) T *= 0.75; // 쿼터매도 → ×0.75

      // ── 매수(T 가 1회분 이상 남았을 때): LOC 종가 체결 ──
      if (T <= splits - 1) {
        let spent = 0;
        const tryBuy = (limit: number, amt: number) => {
          if (bar.close > limit) return;
          const q = Math.floor(amt / limit); // 주문 수량은 지정가 기준
          if (q < 1) return;
          spent += buyFill(bar, q, bar.close);
          push("buy", bar, q, bar.close);
        };
        if (T < splits / 2) {
          tryBuy(starPoint, one / 2); // 절반 별지점
          tryBuy(avg, one / 2); // 절반 평단
        } else {
          tryBuy(starPoint, one); // 후반전: 전체 별지점(평단 아래)
        }
        // 사다리 근사: 원문 사다리 레벨은 평단 아래 배치 — 종가가 평단 이하(급락 영역)일 때만
        // 남은 1회매수액을 종가로 소진. 전반전 별지점 레그만 체결된 보통날은 +0.5회차 유지.
        if (spent > 0) {
          if (bar.close <= avg) {
            const rest = one - spent;
            const q = Math.floor(rest / bar.close);
            if (q >= 1) {
              spent += buyFill(bar, q, bar.close);
              push("buy", bar, q, bar.close);
            }
          }
          T += spent / one;
        }
        if (T > splits - 1) {
          mode = "reverse"; // 소진 → 다음날 리버스 첫날
          reverseFirstDay = true;
        }
      } else {
        mode = "reverse";
        reverseFirstDay = true;
      }
    } else {
      // ── 리버스모드 ──
      const starR = prev5.length >= 5 ? prev5.reduce((a, x) => a + x, 0) / prev5.length : bar.close;
      let sellQ = Math.floor(qty / REV_DIVISOR);
      if (sellQ < 1 && qty > 0) sellQ = 1; // 보유가 등분 미만이어도 정리 진행(원문 미명시 — 실용 처리)

      if (reverseFirstDay) {
        // 첫날: 무조건 MOC 매도, 매수 없음
        push("sell", bar, sellQ, bar.close, (bar.close - avg) * sellQ);
        qty -= sellQ;
        cash += bar.close * sellQ;
        T *= REV_SELL_DECAY;
        reverseFirstDay = false;
      } else {
        // 매도: 별지점R 위 LOC
        if (bar.close >= starR && sellQ >= 1) {
          push("sell", bar, sellQ, bar.close, (bar.close - avg) * sellQ);
          qty -= sellQ;
          cash += bar.close * sellQ;
          T *= REV_SELL_DECAY;
        }
        // 쿼터매수: 잔금/4 를 별지점R 아래 LOC
        if (bar.close < starR) {
          const q = Math.floor(cash / 4 / bar.close);
          if (q >= 1) {
            buyFill(bar, q, bar.close);
            T += (splits - T) * 0.25;
            push("buy", bar, q, bar.close);
          }
        }
      }
      if (qty === 0) {
        avg = 0;
        T = 0;
        mode = "normal";
        entryLimit = null;
      } else if (bar.close > avg * (1 - RECOVER_PCT)) {
        recoverConfirmed = true; // 회복 확인 → 다음날부터 일반모드(T 연결)
      }
    }

    equityCurve.push({ date: bar.date, equity: qty * bar.close });
  }

  const totalPnl = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.pnl, 0);
  return { trades, equityCurve, totalPnl };
}
