import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: named export 는 순수 node ESM 에서 안 풀려 default 로 접근(tsx 스크립트 호환).
const { Schema, model, models } = mongoose;

/**
 * 포트폴리오 시계열 — stock-automator reports/{paper,real}/portfolio_history.json 동기화.
 *
 * env: "paper" | "real"
 * currency: "KRW" | "USD" — 국장/미장 분리
 * date: ISO timestamp (사이클 끝 시점) — 같은 날 여러 사이클 가능
 * dateStr: "YYYY-MM-DD" — 차트 x 축 + 매매 join key
 *
 * unique: (env, currency, date)
 */
const PortfolioHistorySchema = new Schema(
  {
    env: { type: String, required: true, enum: ["paper", "real"], index: true },
    currency: { type: String, required: true, default: "KRW", index: true },
    date: { type: String, required: true }, // ISO
    dateStr: { type: String, required: true, index: true }, // YYYY-MM-DD
    totalValue: { type: Number, required: true },
    cash: { type: Number, default: 0 },
    holdingsValue: { type: Number, default: 0 },
    runPnl: { type: Number, default: 0 },
    cumulativePnl: { type: Number, default: 0 },
  },
  { timestamps: true },
);

PortfolioHistorySchema.index(
  { env: 1, currency: 1, date: 1 },
  { unique: true },
);

export type PortfolioHistoryType = InferSchemaType<typeof PortfolioHistorySchema>;

const PortfolioHistory: Model<PortfolioHistoryType> =
  models.PortfolioHistory ||
  model<PortfolioHistoryType>("PortfolioHistory", PortfolioHistorySchema);

export default PortfolioHistory;
