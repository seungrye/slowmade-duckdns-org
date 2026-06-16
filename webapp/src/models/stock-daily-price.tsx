import { InferSchemaType, Schema, model, models, Model } from "mongoose";

/**
 * 종목 일봉 — 종가 line chart 용 시계열.
 *
 * 키: (ticker, date) 복합 unique. ticker 표기는 KIS 형식과 일치 (Stock.ticker 와 동일).
 * date: "YYYY-MM-DD" 문자열 — 멀티 timezone (KST KOSPI / ET NASDAQ) 혼합 시 시각 잘림
 *       회피. 거래일 기준.
 *
 * close 만 필수, open/high/low/volume 은 선택 (없는 source 도 수용).
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

// (ticker, date) 복합 unique — 중복 ingest 방지
StockDailyPriceSchema.index({ ticker: 1, date: -1 }, { unique: true });

export type StockDailyPriceType = InferSchemaType<typeof StockDailyPriceSchema>;

const StockDailyPrice: Model<StockDailyPriceType> =
  models.StockDailyPrice ||
  model<StockDailyPriceType>("StockDailyPrice", StockDailyPriceSchema);

export default StockDailyPrice;
