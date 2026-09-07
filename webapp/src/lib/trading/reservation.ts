/**
 * Fund reservation (#339) - **pure**. It knows nothing of the DB or brokers.
 *
 * It solves the problem that appeared once one account and market could hold several portfolio blocks: the
 * engines read the account deposit **whole** (`broker.account()` and `V4Broker.snapshot()`), so with two blocks
 * both believe all of it is theirs and together try to spend twice the balance.
 *
 * So the money is **divided up front**, per block. The same idea as `reservation.py` in the Python repo.
 *
 * ── Why order is priority ────────────────────────────────────────────────
 *
 * When money is short, something has to decide who gets cut. Cutting everyone proportionally leaves **every
 * block slightly short**, so none can follow its strategy (infinite buying's rounds fall out of step, and
 * rotation cannot hit its target weight). Filling from the front leaves **at least the first blocks whole**.
 *
 * The order is creation order (`createdAt`) - what a person set up first comes first.
 */

export type ReservationBlock = {
  id: string;
  /** The amount recorded as claimed. Empty (0, negative or absent) means **all that is left at that point**. */
  reserved?: number | null;
};

export type Reservation = {
  id: string;
  /** What this block may actually spend. */
  granted: number;
  /** It got less than it wanted (there was not enough left). */
  short: boolean;
  /** It got nothing - the block is skipped for the day. */
  held: boolean;
};

/** Whether the recorded reservation is a meaningful value. 0, negative and absent all mean "everything". */
function wants(reserved: number | null | undefined): number | null {
  return typeof reserved === "number" && reserved > 0 ? reserved : null;
}

/**
 * The cash one block can see.
 *
 * With no reservation it is everything (the behaviour so far); with one, that much. **A reservation larger than
 * the cash is capped at the cash** - telling an engine money exists that does not makes it place orders it cannot fill.
 */
export function usableCash(accountCash: number, reserved?: number | null): number {
  const cash = Math.max(0, accountCash);
  const want = wants(reserved);
  return want === null ? cash : Math.min(want, cash);
}

/**
 * Divides cash among several blocks. It is claimed from the front, capped at what is left, and held back when nothing remains.
 *
 * The total handed out **never exceeds the account cash** - that is why this function exists.
 */
export function planReservations(accountCash: number, blocks: ReservationBlock[]): Reservation[] {
  let remaining = Math.max(0, accountCash);

  return blocks.map(({ id, reserved }) => {
    const want = wants(reserved);
    // With no reservation, the block means to spend whatever is left.
    const asked = want === null ? remaining : want;
    const granted = Math.min(asked, remaining);
    remaining -= granted;

    return { id, granted, short: granted < asked, held: granted <= 0 };
  });
}
