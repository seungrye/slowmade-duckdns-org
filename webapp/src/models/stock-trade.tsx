import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: named export 는 순수 node ESM 에서 안 풀려 default 로 접근(tsx 스크립트 호환).
const { Schema, model, models } = mongoose;

/**
 * 매매 기록 — stock-automator reports/{paper,real}/trades.json 동기화.
 *
 * env: "paper" | "real" — 모의/실전 구분.
 * action: "buy" | "sell".
 * strategy: 전략 구분 (예: "infinite" 무한매수 | "trend" 추세추종). v2 가 전송. 빈 문자열=미지정.
 * date: "YYYY-MM-DD" — 차트의 x 축 (일봉 데이터와 join).
 * time: ISO 문자열(마이크로초) — 같은 날 여러 건 구분 + unique 키.
 *
 * 복합 unique: (env, ticker, time). v2 의 time 은 마이크로초라 같은 사이클 다건도 고유.
 */
const StockTradeSchema = new Schema(
  {
    env: { type: String, required: true, enum: ["paper", "real"], index: true },
    ticker: { type: String, required: true, index: true },
    action: { type: String, required: true, enum: ["buy", "sell"] },
    strategy: { type: String, default: "", index: true },
    qty: { type: Number, required: true },
    cumulativeQty: { type: Number, default: 0 }, // 체결 후 종목 누적 보유 수량(전량 매도 뒤 0)
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
