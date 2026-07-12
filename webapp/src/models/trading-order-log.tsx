import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: named export(models 등)는 순수 node ESM 에서 안 풀려 default 로 접근한다
// (Next/webpack·tsx 스크립트 양쪽 호환 — trading-smoke 등 서버 외 구동 지원).
const { Schema, model, models } = mongoose;

/**
 * 주문 로그 — 엔진이 내려던/내린 주문 1건마다 append(파이썬 trades/ ledger 대응).
 * dry-run 은 orderNo="" + dryRun=true. 계정별 매매 확인·차트의 기초 데이터.
 */
const TradingOrderLogSchema = new Schema(
  {
    accountId: { type: Schema.Types.ObjectId, ref: "TradingAccount", required: true, index: true },
    runId: { type: Schema.Types.ObjectId, ref: "TradingRun", required: true, index: true },
    envKey: { type: String, required: true, index: true }, // 차트 조인 키(예: paper-50194613)
    market: { type: String, required: true, enum: ["kr", "us"] },
    strategy: { type: String, required: true },
    symbol: { type: String, required: true },
    side: { type: String, required: true, enum: ["buy", "sell"] },
    qty: { type: Number, required: true },
    price: { type: Number, required: true },
    ordType: { type: String, default: "market" },
    reason: { type: String, default: "" },
    dryRun: { type: Boolean, default: true },
    orderNo: { type: String, default: "" },
  },
  { timestamps: true },
);

export type TradingOrderLogType = InferSchemaType<typeof TradingOrderLogSchema>;

const TradingOrderLog: Model<TradingOrderLogType> =
  models.TradingOrderLog ||
  model<TradingOrderLogType>("TradingOrderLog", TradingOrderLogSchema);

export default TradingOrderLog;
