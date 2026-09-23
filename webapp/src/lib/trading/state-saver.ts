/**
 * 엔진이 영속 상태를 남기는 **유일한 문** (#488).
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────
 *
 * 설정 검증용 "지금 실행"(run-now)은 주문만 막고 상태는 그대로 썼다. 엔진들이
 * `TradingPortfolio.updateOne` 을 직접 부르기 때문이다 — 다섯 군데나 된다.
 * VR 은 특히 나빴다: `sinceCycle += 1` 이 무조건 돌아, 버튼 한 번에 사이클 경계가
 * 앞당겨진다.
 *
 * **`live` 플래그로는 못 가린다.** 모의 계정이나 `TRADING_LIVE_ALLOWED=false` 에서도
 * 스케줄 사이클은 매일 돌고, 그때 상태가 안 쌓이면 dry-run 시뮬레이션 자체가 얼어붙는다.
 * "주문을 안 낸다" 와 "이 실행은 버린다" 는 다른 이야기다.
 *
 * 그래서 엔진마다 분기를 넣는 대신 문을 하나 만든다(`cap-cash.ts` 가 현금에 대해 한 것과
 * 같은 생각 — 엔진마다 넣으면 새 전략이 생길 때 또 잊는다). 엔진은 주입받은 것을 부르고,
 * 일회성 실행만 버리는 구현을 받는다.
 */

import TradingPortfolio from "@/models/trading-portfolio";
import type { Types } from "mongoose";

/** `{ "state.v4": ... }` 처럼 점 표기 경로를 그대로 받는다(호출측이 키를 안다). */
export type StateSaver = (patch: Record<string, unknown>) => Promise<void>;

export const savePortfolioState = (id: Types.ObjectId | string): StateSaver =>
  async (patch) => {
    await TradingPortfolio.updateOne({ _id: id }, { $set: patch });
  };

/** 일회성 실행(run-now)용 — 아무것도 남기지 않는다. */
export const discardState: StateSaver = async () => {};
