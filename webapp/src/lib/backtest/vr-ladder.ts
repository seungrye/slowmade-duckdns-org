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

/** 사다리를 무한정 만들지 않기 위한 상한. 실제로는 예산·보유가 먼저 걸린다. */
const MAX_RUNGS = 200;

/**
 * 매수 사다리 — 밴드 하단을 향해 1주씩.
 *
 * @param budget 이 사다리에 쓸 수 있는 최대 금액. 문서 4기의 "매수 제한 70%" 가 이것이다.
 *   Pool 과 별개로 둔 이유는 한도가 Pool 보다 작을 수 있기 때문이다(4기가 그렇다).
 */
export function vrBuyLadder(args: {
  low: number; qty: number; pool: number; budget: number;
}): VRLadderRung[] {
  const { low, qty, pool, budget } = args;
  // 밴드하단 ÷ 보유수 이므로 보유가 0 이면 정의되지 않는다. 첫 진입은 seedVR 의 몫이다.
  if (!(low > 0) || qty < 1) return [];

  const out: VRLadderRung[] = [];
  let n = qty;
  let 남은Pool = pool;
  let 남은예산 = budget;
  while (out.length < MAX_RUNGS) {
    const price = low / n;
    // 다음 칸을 Pool 도 한도도 감당해야 건다. 못 걸면 거기서 끝이다.
    if (!(price > 0) || price > 남은Pool || price > 남은예산) break;
    남은Pool -= price;
    남은예산 -= price;
    n += 1;
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
}): VRLadderRung[] {
  const { high, qty, pool } = args;
  if (!(high > 0) || qty < 1) return [];

  const 칸수 = Math.min(qty, args.maxRungs ?? qty, MAX_RUNGS);
  const out: VRLadderRung[] = [];
  let n = qty;
  let 남은Pool = pool;
  for (let i = 0; i < 칸수; i++) {
    const price = high / n;
    남은Pool += price;
    n -= 1;
    out.push({ qtyAfter: n, price, poolAfter: 남은Pool });
  }
  return out;
}
