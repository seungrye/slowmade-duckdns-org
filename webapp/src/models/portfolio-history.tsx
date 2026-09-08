import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: a named export does not resolve under plain node ESM, so it is reached through default (for tsx script compatibility).
const { Schema, model, models } = mongoose;

/**
 * The portfolio time series - synced from stock-automator's reports/{paper,real}/portfolio_history.json.
 *
 * env: "paper" | "real"
 * currency: "KRW" | "USD" - separating the domestic and US markets
 * date: an ISO timestamp (the cycle's end) - several cycles a day are possible
 * dateStr: "YYYY-MM-DD" - the chart's x axis plus the join key for the trades
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
    /**
     * For a block row, that block's id (#367). **An account row does not have this field.**
     *
     * With several blocks on one account and market (the US: TQQQ v4 plus SOXL VR) a single account value cannot tell them apart.
     * The account rows stay and the block rows are added - an old query filters with `portfolioId: null`.
     */
    portfolioId: { type: Schema.Types.ObjectId, ref: "TradingPortfolio", default: null, index: true },
    /** The block row's strategy (for the screen's label). Empty on an account row. */
    strategy: { type: String, default: "" },
    /**
     * A past row **rebuilt** from the trade records and daily prices (#373). Marked so it does not mix with the live rows.
     *
     * Only the holdings' value can be rebuilt - the block's book cash (v4's `cycleCash`, VR's `pool`) has
     * no past value in the DB. So this row's `cash` and `totalValue` are **unknown**, and
     * the screen must show an em dash rather than a number. Showing 0 as a number would be the lie
     * "there is no cash" (`block-snapshot.ts` uses cash: null for the same reason).
     */
    backfilled: { type: Boolean, default: false },
    // Soft delete - deleting a portfolio hides that (env,currency) snapshot (recoverably). Queries use { hidden: { $ne: true } }.
    hidden: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// portfolioId goes into the key (#367). Existing documents lack the field and group under null, so an account row is
// one a day as before. Note: mongoose does not drop the old index -
// scripts/drop-portfolio-history-index.mjs has to be run once.
PortfolioHistorySchema.index(
  { env: 1, currency: 1, portfolioId: 1, date: 1 },
  { unique: true },
);

export type PortfolioHistoryType = InferSchemaType<typeof PortfolioHistorySchema>;

const PortfolioHistory: Model<PortfolioHistoryType> =
  models.PortfolioHistory ||
  model<PortfolioHistoryType>("PortfolioHistory", PortfolioHistorySchema);

export default PortfolioHistory;
