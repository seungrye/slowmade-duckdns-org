import { InferSchemaType, Schema, model, models, Model } from "mongoose";

/**
 * 종목 메타 — universe (KOSPI200 / S&P500 / NASDAQ-100) 멤버십과 표시 정보.
 *
 * ticker:
 *   - KR: 6자리 코드 (005930 등)
 *   - US: 영문 심볼 (AAPL, BRK.B 등). KIS API 표기는 점 — Wikipedia 와 다를 수
 *     있어 보관 시 KIS 표기 (BRK.B) 로 통일.
 *
 * market:
 *   - "KR" / "US" 만. 다른 시장은 추후 추가.
 *
 * indices:
 *   - 종목이 속한 인덱스 배열. 예: ["KOSPI200"], ["SP500", "NASDAQ100"].
 *   - 한 종목이 SP500 ∩ NASDAQ100 둘 다 일 수 있음 (예: AAPL).
 */
const StockSchema = new Schema(
  {
    ticker: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    market: { type: String, required: true, enum: ["KR", "US"], index: true },
    exchange: { type: String, default: "" }, // KOSPI / NASDAQ / NYSE / AMEX 등
    indices: { type: [String], default: [], index: true },
    sector: { type: String, default: "" },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

export type StockType = InferSchemaType<typeof StockSchema>;

const Stock: Model<StockType> =
  models.Stock || model<StockType>("Stock", StockSchema);

export default Stock;
