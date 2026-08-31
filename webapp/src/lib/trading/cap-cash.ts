import { usableCash } from "./reservation";
import type { LiveBroker } from "./engines";
import type { V4Broker } from "./infinite-v4-engine";

/**
 * 브로커가 보고하는 **현금만** 예약분으로 줄이는 얇은 껍데기 (#339).
 *
 * ── 왜 엔진이 아니라 여기인가 ──────────────────────────────────────────
 *
 * 현금이 엔진으로 들어오는 문은 둘뿐이다 — `LiveBroker.account()` 와 `V4Broker.snapshot()`.
 * 엔진마다 예약을 넣으면 네 군데(LRS·rotation·trend·v4/VR)를 고쳐야 하고, 새 전략이 생길
 * 때마다 또 잊는다. 문 앞에서 한 번 줄이면 **엔진은 한 줄도 안 고쳐도 된다.**
 *
 * **현금만 줄인다.** 보유 수량·평단·현재가·증권사 평가금액은 계좌의 사실이라 그대로 둔다 —
 * 그걸 왜곡하면 엔진이 자기 포지션을 오해한다. 주문·체결·취소도 그대로 위임한다.
 *
 * 예약이 없으면(`null`) **원래 브로커를 그대로 돌려준다** — 껍데기를 씌우지 않아, 블록이
 * 하나뿐인 기존 사용자는 코드 경로가 예전과 똑같다.
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
