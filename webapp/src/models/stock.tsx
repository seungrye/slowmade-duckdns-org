import { InferSchemaType, Schema, model, models, Model } from "mongoose";

/**
 * A symbol's metadata - its universe (KOSPI200 / S&P500 / NASDAQ-100) membership and display information.
 *
 * ticker:
 *   - KR: the 6-digit code (005930 and so on)
 *   - US: the letter symbol (AAPL, BRKB and so on). **No dots** - `BRKB`, not `BRK.B`.
 *     The live trading universe (lib/trading/universes.ts) and the prices (stockdailyprices) are all spelled
 *     without dots. The old comment said "unified with dots", which was the opposite of reality, and because of it
 *     BRK.B and BF.B could not find their prices and their charts were empty (#335).
 *
 * market:
 *   - "KR" / "US" only. Other markets come later.
 *
 * indices:
 *   - the array of indices the symbol belongs to. For example ["KOSPI200"], ["SP500", "NASDAQ100"].
 *   - one symbol can be in both SP500 and NASDAQ100 (AAPL, for instance).
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
