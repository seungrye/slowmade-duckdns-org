import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: a named export does not resolve under plain node ESM, so it is reached through default (for tsx script compatibility).
const { Schema, model, models } = mongoose;

/**
 * The trade records - synced from stock-automator's reports/{paper,real}/trades.json.
 *
 * env: "paper" | "real" - paper or live.
 * action: "buy" | "sell".
 * strategy: which strategy ("infinite" for infinite buying | "trend" for trend following, for example). Sent by v2. An empty string means unset.
 * date: "YYYY-MM-DD" - the chart's x axis (joined with the daily-bar data).
 * time: an ISO string (microseconds) - telling several trades on one day apart, plus the unique key.
 *
 * The compound unique: (env, ticker, time). v2's time is in microseconds, so several trades in one cycle stay unique.
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
    /**
     * The block that placed this fill (#372). Filled in **only when the owner is unambiguous**.
     *
     * close-sync receives the whole account's fills, and looping over the blocks was tagging every one of them
     * with its own strategy - once the US account had two blocks, whichever ran first claimed them (2026-09-01's
     * SOXL was a VR order recorded as infinite_v4). It is attached only when a symbol has exactly one owner.
     * With no owner, or overlapping owners, it is left null and stays attributed to the account.
     */
    portfolioId: { type: Schema.Types.ObjectId, ref: "TradingPortfolio", default: null, index: true },
    // Soft delete - deleting a portfolio hides that (env,currency) record (not a hard delete; recoverable).
    // Unset (undefined) = shown. Queries exclude it with { hidden: { $ne: true } }.
    hidden: { type: Boolean, default: false },
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
