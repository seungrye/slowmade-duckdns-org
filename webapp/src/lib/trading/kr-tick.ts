// KRX 호가단위(tick) 라운딩 — 국내 지정가 주문은 호가단위 위반 시 거부된다
// (KIS 40030000 "호가단위 오류", 토스 400 invalid-tick-size).
//
// 2023-01 개편 기준: ETF·ETN·ELW 는 전 가격대 5원, 주식은 가격 구간별 단위.
// 자동매매 대상은 사실상 전부 ETF 라 기본 kind="etf". 매도 지정가는 올림(목표가
// 이상만 체결 — 보수적), 매수 지정가는 내림(한도 이하 지불 — 보수적).

export type KrTickKind = "etf" | "stock";

export function krTickSize(price: number, kind: KrTickKind = "etf"): number {
  if (kind === "etf") return 5;
  if (price < 2_000) return 1;
  if (price < 5_000) return 5;
  if (price < 20_000) return 10;
  if (price < 50_000) return 50;
  if (price < 200_000) return 100;
  if (price < 500_000) return 500;
  return 1_000;
}

export function krTickRound(
  price: number, side: "buy" | "sell", kind: KrTickKind = "etf",
): number {
  const tick = krTickSize(price, kind);
  const units = side === "buy" ? Math.floor(price / tick) : Math.ceil(price / tick);
  return Math.max(tick, units * tick);
}
