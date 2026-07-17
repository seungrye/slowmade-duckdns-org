import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: named export(models 등)는 순수 node ESM 에서 안 풀려 default 로 접근한다
// (Next/webpack·tsx 스크립트 양쪽 호환 — trading-smoke 등 서버 외 구동 지원).
const { Schema, model, models } = mongoose;

/**
 * 자동매매 포트폴리오 — 계정(TradingAccount) 1개에 시장×전략 블록 여러 개.
 * 파이썬 portfolio.yaml 의 overseas/domestic 블록에 해당.
 *
 * market: kr | us
 * strategy: lrs_v1 | rotation_v1 | trend_v1 | infinite_v4(미장 LOC/국장 에뮬 — KIS·토스).
 * runAt: "HH:MM" — kr 은 KST, us 는 ET(서머타임 자동, 파이썬과 동일 의미).
 * config: 전략별 파라미터 JSON
 *   lrs_v1:      { signal, target, sma?, band? }
 *   rotation_v1: { signal, candidates?(생략=시드 자동선발), sma?, band?, mom?, rebalance? }
 *   trend_v1:    { universe: string[](심볼 배열), shortMa?, longMa?, positionSize? }
 *   infinite_v4: { symbol, principal(필수 — 종목 전용 원금), splits?, starBase?, sellTarget? }
 *                국장은 runAt(09:30 매도)+15:20 매수 phase 가 자동으로 돈다(LOC 에뮬).
 * state: 엔진 영속 상태(rotation last_rebalance·auto_pool 등) — 파이썬 rotation-state 파일 대체.
 */
const TradingPortfolioSchema = new Schema(
  {
    accountId: { type: Schema.Types.ObjectId, ref: "TradingAccount", required: true, index: true },
    market: { type: String, required: true, enum: ["kr", "us"] },
    strategy: { type: String, required: true, enum: ["lrs_v1", "rotation_v1", "trend_v1", "infinite_v4"] },
    runAt: { type: String, required: true, default: "09:05" }, // kr=KST, us=ET
    weekdaysOnly: { type: Boolean, default: true },
    enabled: { type: Boolean, default: true },
    config: { type: Schema.Types.Mixed, default: {} },
    state: { type: Schema.Types.Mixed, default: {} },
    // 소프트 삭제 — 삭제해도 문서를 지우지 않고 숨긴다(재생성 시 같은 (accountId,market)
    // 문서를 재사용해 undelete). 조회는 { isDeleted: { $ne: true } } 로 제외.
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

TradingPortfolioSchema.index({ accountId: 1, market: 1 }, { unique: true }); // 계정당 시장 1블록

export type TradingPortfolioType = InferSchemaType<typeof TradingPortfolioSchema>;

const TradingPortfolio: Model<TradingPortfolioType> =
  models.TradingPortfolio ||
  model<TradingPortfolioType>("TradingPortfolio", TradingPortfolioSchema);

export default TradingPortfolio;
