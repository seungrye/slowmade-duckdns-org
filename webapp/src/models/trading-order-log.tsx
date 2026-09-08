import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: named exports (models and so on) do not resolve under plain node ESM, so they are reached through default
// (compatible with both Next/webpack and tsx scripts - supporting runs outside the server, such as trading-smoke).
const { Schema, model, models } = mongoose;

/**
 * The order log - appended once per order the engine tried to place or placed (matching python's trades/ ledger).
 * A dry run has orderNo="" plus dryRun=true. The base data for per-account trade checks and the charts.
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
