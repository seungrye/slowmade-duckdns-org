// 매수가능수량(수수료·환율 반영) 순수 계산 — 한투(KIS)·토스(Toss) 공통.
// 전량매수(rotation/LRS)가 floor(현금/가격) 총액으로 주문하면 KIS 주문가능금액을 넘겨
// 40250000(주문가능금액 부족)로 거부된다. 실제 주문가능수량으로 사이징하기 위한 헬퍼.
// KIS 는 psamount 응답의 max_ord_psbl_qty/nrcvb_buy_qty(권위 수량)를 pickField 로 읽고,
// 토스는 종목별 최대수량 API 가 없어 feeInclusiveQty 로 매수여력÷(가격×(1+수수료율))를 계산한다.

/** 수수료 포함 매수가능수량 — cash ÷ (price × (1+ratePct/100)) 내림. price<=0 → 0.
 *  ratePct 는 % 단위(예: 미장 0.25 = 0.25%). 토스 buyableQty 용. */
export function feeInclusiveQty(cash: number, price: number, ratePct: number): number {
  if (price <= 0 || cash <= 0) return 0;
  return Math.trunc(cash / (price * (1 + ratePct / 100)));
}

/** 응답 객체에서 keys 순서대로 첫 유효(빈문자열 아님) 값을 숫자로 반환. 없으면 null.
 *  KIS psamount 응답 필드명이 비공개라 후보 키를 우선순위로 순회한다. */
export function pickField(out: Record<string, unknown> | undefined, keys: string[]): number | null {
  for (const k of keys) {
    const v = out?.[k];
    if (v !== undefined && v !== null && v !== "") return Number(v);
  }
  return null;
}

/** 전량매수 클램프 — 원하는 수량과 매수가능수량의 min. 1주 미만이면 0(매수 보류). */
export function clampBuyQty(want: number, maxQty: number): number {
  const q = Math.min(want, maxQty);
  return q >= 1 ? Math.trunc(q) : 0;
}
