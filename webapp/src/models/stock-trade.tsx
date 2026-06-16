import { InferSchemaType, Schema, model, models, Model } from "mongoose";

/**
 * 매매 기록 — stock-automator reports/{paper,real}/trades.json 동기화.
 *
 * env: "paper" | "real" — 모의/실전 구분.
 * action: "buy" | "sell".
 * date: "YYYY-MM-DD" — 차트의 x 축 (일봉 데이터와 join).
 * time: ISO 문자열 — 같은 날 여러 건 구분.
 *
 * 복합 unique: (env, ticker, time). 같은 인스턴스 재실행 시 idempotent.
 */
const StockTradeSchema = new Schema(
  {
    env: { type: String, required: true, enum: ["paper", "real"], index: true },
    ticker: { type: String, required: true, index: true },
    action: { type: String, required: true, enum: ["buy", "sell"] },
    qty: { type: Number, required: true },
    price: { type: Number, required: true },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: "KRW" },
    date: { type: String, required: true }, // YYYY-MM-DD
    time: { type: String, required: true }, // ISO
  },
  { timestamps: true },
);

StockTradeSchema.index({ env: 1, ticker: 1, time: 1 }, { unique: true });
StockTradeSchema.index({ ticker: 1, date: 1 });

export type StockTradeType = InferSchemaType<typeof StockTradeSchema>;

const StockTrade: Model<StockTradeType> =
  models.StockTrade ||
  model<StockTradeType>("StockTrade", StockTradeSchema);

export default StockTrade;
