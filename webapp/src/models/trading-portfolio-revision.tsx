// TradingPortfolioRevision - the values at the moment a portfolio's settings are changed, added or deleted (#350).
//
// It borrows the models/web-adventure-scene-revision pattern as it is:
//   - version increases sequentially from 1 per target id, with independent sequences across ids.
//   - snapshot is Schema.Types.Mixed (config's structure is free-form per strategy).
//   - there is one writer - the POST and DELETE in api/my/trading/portfolios/route.ts.
//
// Why it exists: in #348 a strategy switch overwrote the old config entirely and it was gone. With no backup and no oplog,
// 15 trading days of order logs and fills had to be reverse-engineered through floor() constraints. strategyHistory (#83) recorded
// only "when, from what to what" and kept no values, so it was useless - this model replaces it.

import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: reached through default for the same reason as the other trading models.
const { Schema, model, models } = mongoose;

const TradingPortfolioRevisionSchema = new Schema(
  {
    portfolioId: { type: Schema.Types.ObjectId, ref: "TradingPortfolio", required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: "TradingAccount", required: true },
    // From 1, per portfolioId.
    version: { type: Number, required: true },
    action: { type: String, required: true, enum: ["create", "update", "delete"] },
    /**
     * The whole configuration **after** that change - market, strategy, runAt, weekdaysOnly, enabled, reservedCash and config.
     * What goes in is decided by lib/trading/portfolio-revision.snapshotOf's whitelist.
     *
     * Note: state is not included. The engine changes it on every run (T, cycleCash, lastRunDate), so including it would
     *   pile up revisions on days when no setting was touched and make the history useless.
     */
    snapshot: { type: Schema.Types.Mixed, required: true },
    // The list of changed keys - so what changed can be seen from the list without opening it. An empty array on a create.
    changed: { type: [String], default: [] },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { collection: "tradingportfoliorevisions" },
);

// The list is always "this block's, newest first".
TradingPortfolioRevisionSchema.index({ portfolioId: 1, version: -1 });

export type TradingPortfolioRevisionType = InferSchemaType<typeof TradingPortfolioRevisionSchema>;

const TradingPortfolioRevision: Model<TradingPortfolioRevisionType> =
  models.TradingPortfolioRevision ||
  model<TradingPortfolioRevisionType>("TradingPortfolioRevision", TradingPortfolioRevisionSchema);

export default TradingPortfolioRevision;
