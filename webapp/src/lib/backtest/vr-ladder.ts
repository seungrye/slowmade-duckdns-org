/**
 * VR 사다리 — 밴드 경계를 기준으로 1주씩 거는 지정가 (#360).
 *
 * 문서(2025 VR 강의 정리)는 밴드 경계를 기준으로 **1주씩 지정가**를 2주 기간잔량으로
 * 미리 걸어 둔다. 지금 백테스트·라이브는 종가에 밴드 경계까지 한 번에 체결해서, 장중에
 * 밴드를 스치고 돌아오는 움직임을 통째로 놓친다.
 *
 * ── 가격 규칙 ──────────────────────────────────────────────────────────
 *
 *   매수: n 주 들고 있을 때 n+1 번째를 사는 지정가 = 밴드하단 ÷ n
 *   매도: n 주에서 n−1 로 줄이는 지정가          = 밴드상단 ÷ n
 *
 * 뜻은 하나다 — **그 가격이 되면 평가금이 정확히 밴드 경계**인 지점마다 한 주씩 걸어 둔다.
 * 문서의 6기 33주차·4기 87주차 두 표를 센트까지 재현한다(vr-ladder.test.ts).
 *
 * ── 여기서 하지 않는 것 ────────────────────────────────────────────────
 *
 * 이 모듈은 **주문표를 계산할 뿐** 체결을 모르는 순수 함수다. 백테스트가 일봉의 저가·고가로
 * 몇 칸이 채워졌는지 판정하는 일과, 라이브가 이 표를 실제 지정가 주문으로 내는 일은 아직
 * 붙이지 않았다 — 그 둘은 각각 따로 검증해야 한다(#360 후속).
 */

/** 사다리 한 칸. `price` 에 체결되면 보유가 `qtyAfter`, Pool 이 `poolAfter` 가 된다. */
export interface VRLadderRung {
  qtyAfter: number;
  price: number;
  poolAfter: number;
}

/**
 * 한 사다리의 최대 칸 수.
 *
 * 문서 사례는 25~96주라 1주씩으로 6~11칸이면 끝난다. 그런데 분할조정된 저가 종목이면
 * 같은 원금이 수십만 주가 되어 1주씩으로는 수만 칸이 필요하다 — 현실에서도 주문을 그렇게
 * 낼 수 없다. 그래서 칸당 수량(`lot`)을 호출측이 키울 수 있게 두고, 여기서는 방어 상한만.
 */
const MAX_RUNGS = 500;

/**
 * 매수 사다리 — 밴드 하단을 향해 1주씩.
 *
 * @param budget 이 사다리에 쓸 수 있는 최대 금액. 문서 4기의 "매수 제한 70%" 가 이것이다.
 *   Pool 과 별개로 둔 이유는 한도가 Pool 보다 작을 수 있기 때문이다(4기가 그렇다).
 */
export function vrBuyLadder(args: {
  low: number; qty: number; pool: number; budget: number;
  /** 칸당 주수. 문서는 1주씩이다. 보유가 커서 1주씩이 비현실적일 때만 키운다. */
  lot?: number;
  /** 칸 수 상한. ladderLot 의 추정만으로는 한 칸쯤 넘칠 수 있어 여기서 못 박는다. */
  maxRungs?: number;
}): VRLadderRung[] {
  const { low, qty, pool, budget } = args;
  const lot = Math.max(1, Math.floor(args.lot ?? 1));
  // 밴드하단 ÷ 보유수 이므로 보유가 0 이면 정의되지 않는다. 첫 진입은 seedVR 의 몫이다.
  if (!(low > 0) || qty < 1) return [];

  const out: VRLadderRung[] = [];
  let n = qty;
  let 남은Pool = pool;
  let 남은예산 = budget;
  const 상한 = Math.min(args.maxRungs ?? MAX_RUNGS, MAX_RUNGS);
  while (out.length < 상한) {
    const price = low / n;
    const 대금 = price * lot;
    // 다음 칸을 Pool 도 한도도 감당해야 건다. 못 걸면 거기서 끝이다.
    if (!(price > 0) || 대금 > 남은Pool || 대금 > 남은예산) break;
    남은Pool -= 대금;
    남은예산 -= 대금;
    n += lot;
    out.push({ qtyAfter: n, price, poolAfter: 남은Pool });
  }
  return out;
}

/**
 * 매도 사다리 — 밴드 상단을 향해 1주씩.
 *
 * 매도는 돈이 안 드므로 멈추는 것은 **보유 수량**뿐이다. 문서가 표에 몇 칸까지 보여 줄지는
 * 정하고 있지 않아(6기 6칸·4기 11칸) `maxRungs` 로 받는다 — 규칙을 지어내지 않는다.
 */
export function vrSellLadder(args: {
  high: number; qty: number; pool: number; maxRungs?: number;
  /** 칸당 주수. 매수와 같은 이유로 둔다. */
  lot?: number;
}): VRLadderRung[] {
  const { high, qty, pool } = args;
  if (!(high > 0) || qty < 1) return [];

  const lot = Math.max(1, Math.floor(args.lot ?? 1));
  const 칸수 = Math.min(Math.floor(qty / lot), args.maxRungs ?? qty, MAX_RUNGS);
  const out: VRLadderRung[] = [];
  let n = qty;
  let 남은Pool = pool;
  for (let i = 0; i < 칸수; i++) {
    const price = high / n;
    남은Pool += price * lot;
    n -= lot;
    out.push({ qtyAfter: n, price, poolAfter: 남은Pool });
  }
  return out;
}

/**
 * 칸당 주수 — 문서는 **1주씩**이다 (#360).
 *
 * 그런데 분할조정된 저가 종목이면 같은 예산이 수만 칸이 된다(실측: TQQQ 2011년 20,161칸).
 * 현실에서도 주문을 그렇게 못 내므로, 사다리가 `maxRungs` 안에 들어오도록 칸을 키운다.
 *
 * **보유량이 아니라 "필요한 칸 수"로 정한다.** 보유량으로 잡으면 문서의 4기(85주 보유,
 * 11칸을 1주씩)에서도 7주씩이 되어 문서와 어긋난다.
 */
export function ladderLot(args: {
  low: number; qty: number; budget: number; maxRungs: number;
}): number {
  const { low, qty, budget, maxRungs } = args;
  if (!(low > 0) || qty < 1 || !(budget > 0) || maxRungs < 1) return 1;
  const 첫칸가 = low / qty;
  if (!(첫칸가 > 0)) return 1;
  const 대략칸수 = Math.floor(budget / 첫칸가);
  return Math.max(1, Math.ceil(대략칸수 / maxRungs));
}
