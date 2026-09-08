import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: a named export does not resolve under plain node ESM, so it is reached through default (for tsx script compatibility).
const { Schema, model, models } = mongoose;

/**
 * A symbol's daily bars - the time series for the closing-price line chart.
 *
 * The key: a (ticker, date) compound unique. The ticker's spelling matches the KIS format (the same as Stock.ticker).
 * date: a "YYYY-MM-DD" string - avoiding a truncated time when mixing time zones (KST KOSPI / ET NASDAQ).
 *       By trading day.
 *
 * Only close is required; open/high/low/volume are optional (accommodating a source that lacks them).
 */
const StockDailyPriceSchema = new Schema(
  {
    ticker: { type: String, required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    open: { type: Number, default: null },
    high: { type: Number, default: null },
    low: { type: Number, default: null },
    close: { type: Number, required: true },
    volume: { type: Number, default: null },
  },
  { timestamps: true },
);

// The (ticker, date) compound unique - preventing a duplicate ingest
StockDailyPriceSchema.index({ ticker: 1, date: -1 }, { unique: true });

export type StockDailyPriceType = InferSchemaType<typeof StockDailyPriceSchema>;

const StockDailyPrice: Model<StockDailyPriceType> =
  models.StockDailyPrice ||
  model<StockDailyPriceType>("StockDailyPrice", StockDailyPriceSchema);

export default StockDailyPrice;
