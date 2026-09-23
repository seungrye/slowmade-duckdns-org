/**
 * 자금 예약 (#339) — **순수**. DB·브로커를 모른다.
 *
 * 한 계정·한 시장에 포트폴리오 블록을 여럿 두게 되면서 생긴 문제를 푼다: 엔진들이 계좌
 * 예수금을 **통째로** 읽으므로(`broker.account()` · `V4Broker.snapshot()`), 블록이 둘이면
 * 둘 다 "이 돈이 다 내 것" 이라 믿고 합쳐서 잔고의 두 배를 쓰려 든다.
 *
 * 그래서 블록마다 쓸 돈을 **미리 나눈다.** 파이썬 저장소의 `reservation.py` 와 같은 생각이다.
 *
 * ── 왜 순서가 우선권인가 ────────────────────────────────────────────────
 *
 * 돈이 모자랄 때 누구를 깎을지 정해야 한다. 비율로 고르게 깎으면 **모든 블록이 어중간하게**
 * 모자라 어느 것도 제 전략대로 못 돈다(무한매수는 회차가 어긋나고, 로테이션은 목표 비중을
 * 못 맞춘다). 앞에서부터 채우면 **적어도 앞 블록은 온전히** 돈다.
 *
 * 순서는 만든 순서(`createdAt`)다 — 사람이 먼저 정한 것이 먼저다.
 */

import { formatMoney } from "@/lib/format";

export type ReservationBlock = {
  id: string;
  /** 쓰겠다고 적어 둔 금액. 비우면(0·음수·없음) **그 시점 잔여 전액**. */
  reserved?: number | null;
};

export type Reservation = {
  id: string;
  /** 실제로 이 블록이 쓸 수 있는 금액. */
  granted: number;
  /** 원하던 만큼 못 받았다(남은 돈이 모자랐다). */
  short: boolean;
  /** 한 푼도 못 받았다 — 그날은 이 블록을 건너뛴다. */
  held: boolean;
};

/** 적어 둔 예약이 뜻이 있는 값인가. 0·음수·없음은 "전액" 으로 본다. */
function wants(reserved: number | null | undefined): number | null {
  return typeof reserved === "number" && reserved > 0 ? reserved : null;
}

/**
 * 한 블록이 볼 수 있는 현금.
 *
 * 예약이 없으면 전액(지금까지의 동작), 있으면 그만큼. **예약이 현금보다 크면 현금까지만** —
 * 없는 돈을 있다고 알려 주면 엔진이 살 수 없는 주문을 낸다.
 */
export function usableCash(accountCash: number, reserved?: number | null): number {
  const cash = Math.max(0, accountCash);
  const want = wants(reserved);
  return want === null ? cash : Math.min(want, cash);
}

/**
 * 여러 블록에 현금을 나눈다. 앞에서부터 선점하고, 모자라면 남은 만큼만, 없으면 보류.
 *
 * 나눠 준 합은 **절대 계좌 현금을 넘지 않는다** — 그게 이 함수의 존재 이유다.
 */
export function planReservations(accountCash: number, blocks: ReservationBlock[]): Reservation[] {
  let remaining = Math.max(0, accountCash);

  return blocks.map(({ id, reserved }) => {
    const want = wants(reserved);
    // 예약이 없으면 남은 것을 다 쓰겠다는 뜻이다.
    const asked = want === null ? remaining : want;
    const granted = Math.min(asked, remaining);
    remaining -= granted;

    return { id, granted, short: granted < asked, held: granted <= 0 };
  });
}

/**
 * 설정 화면에 띄울 예약 경고 (#495) — **순수**.
 *
 * 예전엔 두 경고가 다 사람 눈에 안 닿았다. `overReservedMessage` 는 호출자가 없었고,
 * "예약을 안 적어 남은 전액을 쓴다" 는 사이클 로그에만 남아 뒤져야 보였다. 실계좌로
 * 넘기기 전에 **설정 화면에서** 보여야 할 정보다.
 *
 * `accountCash` 는 브로커를 부르지 않고 **close-sync 가 매일 적어 둔 마지막 값**을 쓴다
 * (설정 페이지가 KIS 를 때리면 유량·지연이 생긴다). 그래서 기준일(`asOf`)을 문구에 싣는다 —
 * 오늘 잔고가 아니라는 걸 읽는 사람이 알아야 한다. 현금을 모르면 그 경고는 조용히 생략한다.
 */
export function reservationWarnings(args: {
  blocks: { reserved?: number | null }[];
  accountCash: number | null;
  market: "kr" | "us";
  asOf?: string | null;
}): string[] {
  const { blocks, accountCash, market, asOf } = args;
  const out: string[] = [];

  // 블록이 하나뿐이면 "전액" 이 정상이다 — 예전과 같은 동작이라 경고하지 않는다.
  const uncapped = blocks.filter((b) => wants(b.reserved) === null).length;
  if (blocks.length > 1 && uncapped > 0) {
    out.push(
      `예약을 안 적은 블록이 ${uncapped}개 있습니다 — 그 블록이 남은 현금을 전부 씁니다.`,
    );
  }

  if (accountCash !== null && Number.isFinite(accountCash)) {
    const sum = blocks.reduce((a, b) => a + (wants(b.reserved) ?? 0), 0);
    if (sum > accountCash) {
      out.push(
        `예약 합계 ${formatMoney(sum, market)} 가 현금 ${formatMoney(accountCash, market)}` +
        `${asOf ? `(${asOf} 기준)` : ""} 보다 큽니다 — 뒤 블록이 그날 보류될 수 있습니다.`,
      );
    }
  }
  return out;
}
