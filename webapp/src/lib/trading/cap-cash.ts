import { usableCash } from "./reservation";
import type { LiveBroker } from "./engines";
import type { V4Broker } from "./infinite-v4-engine";

/**
 * A thin wrapper that reduces **only the cash** the broker reports to the reserved amount (#339).
 *
 * -- Why here rather than in the engines --------------------------------
 *
 * Cash enters the engines through exactly two doors: `LiveBroker.account()` and `V4Broker.snapshot()`.
 * Putting the reservation in each engine means fixing four places (LRS, rotation, trend, v4/VR) and
 * forgetting again with every new strategy. Reducing it once at the door means **no engine changes at all.**
 *
 * **Only cash is reduced.** Holdings, average price, current price and the broker's valuation are facts
 * about the account and stay untouched - distorting them makes an engine misread its own position.
 * Orders, fills and cancellations are delegated unchanged.
 *
 * With no reservation (`null`) it **returns the original broker** - no wrapper, so a user with a single
 * block takes exactly the same code path as before.
 */

export function capLiveBroker(broker: LiveBroker, granted: number | null | undefined): LiveBroker {
  if (granted === null || granted === undefined) return broker;
  return {
    ...broker,
    async account() {
      const [holdings, cash, equity] = await broker.account();
      return [holdings, usableCash(cash, granted), equity];
    },
  };
}

export function capV4Broker(broker: V4Broker, granted: number | null | undefined): V4Broker {
  if (granted === null || granted === undefined) return broker;
  return {
    ...broker,
    async snapshot(sym: string) {
      const snap = await broker.snapshot(sym);
      return { ...snap, cash: usableCash(snap.cash, granted) };
    },
  };
}
