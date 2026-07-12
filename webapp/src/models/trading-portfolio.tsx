import { InferSchemaType, Schema, model, models, Model } from "mongoose";

/**
 * 자동매매 포트폴리오 — 계정(TradingAccount) 1개에 시장×전략 블록 여러 개.
 * 파이썬 portfolio.yaml 의 overseas/domestic 블록에 해당.
 *
 * market: kr | us
 * strategy: 1단계는 lrs_v1 | rotation_v1 | trend_v1 (무한매수 v1/v4 는 2단계).
 * runAt: "HH:MM" — kr 은 KST, us 는 ET(서머타임 자동, 파이썬과 동일 의미).
 * config: 전략별 파라미터 JSON
 *   lrs_v1:      { signal, target, sma?, band? }
 *   rotation_v1: { signal, candidates?(생략=시드 자동선발), sma?, band?, mom?, rebalance? }
 *   trend_v1:    { universe: string[](심볼 배열), shortMa?, longMa?, positionSize? }
 * state: 엔진 영속 상태(rotation last_rebalance·auto_pool 등) — 파이썬 rotation-state 파일 대체.
 */
const TradingPortfolioSchema = new Schema(
  {
    accountId: { type: Schema.Types.ObjectId, ref: "TradingAccount", required: true, index: true },
    market: { type: String, required: true, enum: ["kr", "us"] },
    strategy: { type: String, required: true, enum: ["lrs_v1", "rotation_v1", "trend_v1"] },
    runAt: { type: String, required: true, default: "09:05" }, // kr=KST, us=ET
    weekdaysOnly: { type: Boolean, default: true },
    enabled: { type: Boolean, default: true },
    config: { type: Schema.Types.Mixed, default: {} },
    state: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

TradingPortfolioSchema.index({ accountId: 1, market: 1 }, { unique: true }); // 계정당 시장 1블록

export type TradingPortfolioType = InferSchemaType<typeof TradingPortfolioSchema>;

const TradingPortfolio: Model<TradingPortfolioType> =
  models.TradingPortfolio ||
  model<TradingPortfolioType>("TradingPortfolio", TradingPortfolioSchema);

export default TradingPortfolio;
