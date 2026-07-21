// 유휴현금 top-up(현금 드래그 제거) 순수 계산 — 라이브 엔진(engines.ts)이 쓰는 부수효과 없는 헬퍼.
// 입금·미정산 정산 등으로 계좌에 놀고 있는 현금을, 보유 종목을 "목표 노출"까지 채우도록 추가 매수한다.
// 결정 함수(strategies.ts)는 손대지 않는다(백테스트=실거래 파리티 유지) — 이건 실행계층 사이징 보조.

/**
 * 목표 평가액까지 채우기 위한 추가 매수 수량.
 *   - 부족분 = targetNotional − currentNotional. 0 이하이면(이미 목표 도달/초과) 0.
 *   - want = floor(부족분 / price). 브로커 매수가능수량(buyableQty)으로 클램프(주문거부 방지).
 *   - price ≤ 0 이면 0.
 *
 * 전량 전략(rotation/LRS)은 targetNotional=현금+보유평가액(=전액 투입 목표), 추세는
 * targetNotional=positionSize×총자산(종목당 목표 비중)으로 호출한다.
 */
export function topUpQty(args: {
  targetNotional: number;
  currentNotional: number;
  price: number;
  buyableQty: number;
}): number {
  if (args.price <= 0) return 0;
  const deficit = args.targetNotional - args.currentNotional;
  if (deficit <= 0) return 0;
  const want = Math.floor(deficit / args.price);
  const cap = Math.floor(Math.max(0, args.buyableQty));
  return Math.max(0, Math.min(want, cap));
}
