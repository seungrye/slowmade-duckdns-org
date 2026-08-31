import { InferSchemaType, Schema, model, models, Model } from "mongoose";

/**
 * 종목 메타 — universe (KOSPI200 / S&P500 / NASDAQ-100) 멤버십과 표시 정보.
 *
 * ticker:
 *   - KR: 6자리 코드 (005930 등)
 *   - US: 영문 심볼 (AAPL, BRKB 등). **점을 넣지 않는다** — `BRK.B` 가 아니라 `BRKB`.
 *     라이브 매매 유니버스(lib/trading/universes.ts)와 가격(stockdailyprices)이 전부 점
 *     없는 표기다. 예전 주석은 "점으로 통일" 이라 적혀 있었는데 실제와 반대였고, 그 탓에
 *     BRK.B·BF.B 는 가격을 못 찾아 차트가 비었다 (#335).
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
