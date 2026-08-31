import { Types } from "mongoose";
import TradingPortfolio from "@/models/trading-portfolio";
import { planReservations } from "./reservation";
import { formatMoney } from "@/lib/format";

/**
 * 이 블록이 실제로 쓸 수 있는 현금 (#339) — 부수효과 경계(DB 조회).
 *
 * 판정 자체는 `reservation.ts`(순수)가 한다. 여기서는 **같은 계정·같은 시장의 형제 블록**을
 * 만든 순서대로 모아 넘길 뿐이다.
 *
 * **블록이 하나뿐이고 예약도 안 적었으면 `null`** 을 준다 — 그러면 호출측이 브로커를 감싸지
 * 않아 예전과 코드 경로가 완전히 같다. 블록이 하나인 사용자에게 새 위험을 만들지 않는다.
 *
 * 계좌 현금은 아직 모른다(브로커를 부르기 전이다). 그래서 여기서는 **예약액 자체**를 상한으로
 * 주고, 실제 계좌 현금과의 비교는 `usableCash` 가 브로커 응답 시점에 한다.
 */
export async function grantedCashFor(
  account: { _id: Types.ObjectId | string },
  portfolio: { _id: Types.ObjectId | string; market: string; reservedCash?: number | null },
  log?: (msg: string) => void,
): Promise<number | null> {
  const siblings = await TradingPortfolio
    .find({ accountId: account._id, market: portfolio.market, isDeleted: { $ne: true } })
    .select({ reservedCash: 1, createdAt: 1 })
    .sort({ createdAt: 1 })
    .lean();

  // 형제가 없거나 나 혼자면, 예약을 안 적은 이상 전액이다.
  const reserved = Number(portfolio.reservedCash ?? 0);
  if (siblings.length <= 1 && !(reserved > 0)) return null;

  // 형제가 여럿이면 예약을 안 적은 블록도 "남은 전액" 으로 잡히므로 순서가 뜻을 가진다.
  const rows = planReservations(
    Number.MAX_SAFE_INTEGER, // 계좌 현금은 브로커가 알려 준다 — 여기선 예약끼리의 순서만 본다
    siblings.map((s) => ({ id: String(s._id), reserved: Number(s.reservedCash ?? 0) })),
  );
  const mine = rows.find((r) => r.id === String(portfolio._id));
  if (!mine) return reserved > 0 ? reserved : null;

  // 예약을 안 적은 블록은 여기서 MAX 가 되므로 상한이 없는 것과 같다 → null.
  if (!(reserved > 0)) {
    log?.(`[예약] 이 블록은 예약을 안 적어 남은 현금 전부를 씁니다 — 형제 블록이 ${siblings.length - 1}개 있습니다.`);
    return null;
  }
  return reserved;
}

/** 저장 화면·로그에서 쓸 요약 — 예약 합이 현금을 넘는지 알린다. */
export function overReservedMessage(
  accountCash: number,
  reservations: number[],
  market: "kr" | "us",
): string | null {
  const sum = reservations.reduce((a, b) => a + b, 0);
  if (sum <= accountCash) return null;
  return `예약 합계 ${formatMoney(sum, market)} 가 현금 ${formatMoney(accountCash, market)} 보다 큽니다 — 뒤 블록이 그날 보류될 수 있습니다.`;
}
