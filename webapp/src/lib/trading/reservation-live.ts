import { Types } from "mongoose";
import TradingPortfolio from "@/models/trading-portfolio";
import { planReservations } from "./reservation";
import { formatMoney } from "@/lib/format";

/**
 * The cash this block can actually use (#339) - the side-effect boundary (a DB query).
 *
 * The decision itself belongs to `reservation.ts` (pure). This only gathers the **sibling blocks on the same
 * account and market**, in creation order, and passes them along.
 *
 * **With a single block and no reservation recorded it gives `null`** - the caller then does not wrap the broker,
 * so the code path is exactly what it was. A user with one block gains no new risk.
 *
 * The account's cash is still unknown here (the broker has not been called). So this returns **the reserved amount**
 * as the cap, and `usableCash` compares it against the real account cash once the broker responds.
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

  // With no siblings, or alone, it is the whole amount unless a reservation was recorded.
  const reserved = Number(portfolio.reservedCash ?? 0);
  if (siblings.length <= 1 && !(reserved > 0)) return null;

  // With several siblings, a block with no reservation is treated as "all that is left", so the order matters.
  const rows = planReservations(
    Number.MAX_SAFE_INTEGER, // 계좌 현금은 브로커가 알려 준다 — 여기선 예약끼리의 순서만 본다
    siblings.map((s) => ({ id: String(s._id), reserved: Number(s.reservedCash ?? 0) })),
  );
  const mine = rows.find((r) => r.id === String(portfolio._id));
  if (!mine) return reserved > 0 ? reserved : null;

  // A block with no reservation becomes MAX here, which is the same as having no cap -> null.
  if (!(reserved > 0)) {
    log?.(`[예약] 이 블록은 예약을 안 적어 남은 현금 전부를 씁니다 — 형제 블록이 ${siblings.length - 1}개 있습니다.`);
    return null;
  }
  return reserved;
}

/** A summary for the settings screen and the log - it flags when the reservations exceed the cash. */
export function overReservedMessage(
  accountCash: number,
  reservations: number[],
  market: "kr" | "us",
): string | null {
  const sum = reservations.reduce((a, b) => a + b, 0);
  if (sum <= accountCash) return null;
  return `예약 합계 ${formatMoney(sum, market)} 가 현금 ${formatMoney(accountCash, market)} 보다 큽니다 — 뒤 블록이 그날 보류될 수 있습니다.`;
}
