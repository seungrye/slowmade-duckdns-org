// 무한매수 V4.0 — 하루 주문 계획 단일 소스(백테스트=실거래 공용, 순수 함수).
// 파이썬 strategy/infinite_v4.plan_day() 와 규칙·상수 완전 대칭.
//
// 종가를 모르는 상태에서 실제로 낼 주문 목록을 산출한다:
//   - 매수 = LOC 분할 매수 사다리(원문 §4): 맨 윗칸(전반 [별지점−0.01 X/2 + 평단 나머지] /
//     후반 [별지점−0.01 X] / 진입 [전일종가+10%]) + 아래로 X÷k 가격에 1주씩,
//     참조가−20%(증권사 거부 한계)까지. 참조가+20% 초과 칸은 큰수(참조가+10%)로 접어내림.
//   - 매도 = ¼ 별지점 LOC + ¾ 평단×(1+목표%) 지정가(장중). 참조가+20% 초과 매도점은
//     걸지 않음(원문 §4.4 — 매도 거부는 그냥 넘어감).
//   - 리버스 = 첫날 MOC 매도 / 이후 별지점R 위 LOC 매도 + 잔금/4 쿼터매수(LOC).
// 실거래 엔진은 이 주문을 브로커로 전송, 백테스트는 LOC 체결 규칙으로 채점한다.

export const BROKER_GAP = 0.20; // 증권사 주문 거부 한계(현재가 대비) — 사다리 깊이·큰수 기준
export const BIG_BUY_PCT = 0.10; // 큰수 매수 지점(참조가 +10%) — 원문 "10~15%는 가이드"

export type V4PlanConfig = {
  splits: number;
  starBase: number; // 별% base(TQQQ 15 / SOXL 20)
  sellTarget: number; // 75% 지정가매도 목표(0.15)
};

export type V4PlannedOrder = {
  side: "buy" | "sell";
  qty: number;
  price: number; // 지정가(LOC/limit). market 은 참조용
  kind: "loc" | "limit" | "market";
  tag: "entry" | "star" | "avg" | "rung" | "big" | "q25" | "q75"
    | "rev_first" | "rev_sell" | "rev_qbuy";
};

export const v4StarPct = (t: number, splits: number, base: number) =>
  (base - (2 * base * t) / splits) / 100;

const r2 = (x: number) => Math.trunc(x * 100) / 100; // 가격 소수점 둘째 자리 버림(원문)

/** LOC 분할 매수 사다리 — tops=[가격, 배정금액] 순서대로 맨 윗칸, 아래로 X÷k 1주씩. */
function buyLadder(
  tops: [number, number][], shot: number, ref: number,
): V4PlannedOrder[] {
  const floorP = ref * (1 - BROKER_GAP);
  const capP = ref * (1 + BROKER_GAP);
  const orders: V4PlannedOrder[] = [];
  let bigQty = 0;
  let n = 0;
  tops.forEach(([price, amt], i) => {
    const p = r2(price);
    if (p <= 0 || amt <= 0) return;
    const q = Math.floor(amt / p);
    if (q < 1) return;
    n += q;
    if (p > capP) bigQty += q; // 급락으로 매수점이 너무 위 → 큰수로 접기(원문 §4.3)
    else if (p >= floorP) {
      orders.push({ side: "buy", qty: q, price: p, kind: "loc",
                    tag: i === tops.length - 1 && tops.length > 1 ? "avg" : "star" });
    }
    // p < floorP: 거부 — 걸지 않음(사다리 단이 대신 커버)
  });
  for (let k = n + 1; k <= n + 1000; k++) {
    const p = r2(shot / k);
    if (p < floorP || p <= 0) break;
    if (p <= capP) orders.push({ side: "buy", qty: 1, price: p, kind: "loc", tag: "rung" });
  }
  if (bigQty >= 1) {
    orders.push({ side: "buy", qty: bigQty, price: r2(ref * (1 + BIG_BUY_PCT)), kind: "loc", tag: "big" });
  }
  return orders;
}

export function v4PlanDay(args: {
  mode: "normal" | "reverse";
  t: number;
  avg: number;
  holding: number;
  cash: number;
  refPrice: number; // 참조가 = 전일종가(백테스트) / 주문시점 현재가(실거래)
  entryLimit: number | null;
  prev5: number[]; // 직전 5거래일 종가(리버스 별지점R)
  reverseFirstDay: boolean;
  cfg: V4PlanConfig;
}): V4PlannedOrder[] {
  const { mode, t, avg, holding, cash, refPrice, cfg } = args;
  const orders: V4PlannedOrder[] = [];
  const floorP = refPrice * (1 - BROKER_GAP);
  const capP = refPrice * (1 + BROKER_GAP);

  if (holding === 0 && mode === "normal") {
    const limit = r2(args.entryLimit ?? refPrice * (1 + BIG_BUY_PCT));
    const shot = cash / cfg.splits;
    const q = Math.floor(shot / limit);
    if (q >= 1) {
      orders.push({ side: "buy", qty: q, price: limit, kind: "loc", tag: "entry" });
      for (const o of buyLadder([[limit, shot]], shot, refPrice)) {
        if (o.tag === "rung") orders.push(o);
      }
    }
    return orders;
  }

  if (mode === "normal") {
    const sp = avg * (1 + v4StarPct(t, cfg.splits, cfg.starBase));
    const shot = cash / Math.max(0.5, cfg.splits - t);
    const q25 = Math.floor(holding / 4);
    const q75 = holding - q25;
    const target = r2(avg * (1 + cfg.sellTarget));
    if (q75 >= 1 && target <= capP) {
      orders.push({ side: "sell", qty: q75, price: target, kind: "limit", tag: "q75" });
    }
    const sp2 = r2(sp);
    if (q25 >= 1 && sp2 >= floorP && sp2 <= capP) {
      orders.push({ side: "sell", qty: q25, price: sp2, kind: "loc", tag: "q25" });
    }
    if (t <= cfg.splits - 1) {
      if (t < cfg.splits / 2) {
        const top1 = r2(sp - 0.01);
        const n1 = top1 > 0 ? Math.floor(shot / 2 / top1) : 0;
        const rest = shot - n1 * top1;
        orders.push(...buyLadder([[top1, shot / 2], [avg, rest]], shot, refPrice));
      } else {
        orders.push(...buyLadder([[r2(sp - 0.01), shot]], shot, refPrice));
      }
    }
    return orders;
  }

  // reverse
  const starR = args.prev5.length >= 5
    ? args.prev5.reduce((a, b) => a + b, 0) / args.prev5.length : refPrice;
  let sellQ = Math.floor(holding / (cfg.splits / 2));
  if (sellQ < 1 && holding > 0) sellQ = 1; // 보유가 등분 미만이어도 정리(원문 미명시 — 실용)
  if (args.reverseFirstDay) {
    if (sellQ >= 1) orders.push({ side: "sell", qty: sellQ, price: r2(refPrice), kind: "market", tag: "rev_first" });
    return orders;
  }
  const sr = r2(starR);
  if (sellQ >= 1 && sr <= capP) {
    orders.push({ side: "sell", qty: sellQ, price: sr, kind: "loc", tag: "rev_sell" });
  }
  // 쿼터매수 — 별지점R 이 참조가+20% 를 넘으면(급락 직후) 큰수 지점으로 접어 내림.
  const buyP = Math.min(sr, r2(refPrice * (1 + BIG_BUY_PCT)));
  const q = buyP > 0 ? Math.floor(cash / 4 / buyP) : 0;
  if (q >= 1 && buyP >= floorP) {
    orders.push({ side: "buy", qty: q, price: buyP, kind: "loc", tag: "rev_qbuy" });
  }
  return orders;
}
