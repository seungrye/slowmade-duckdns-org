import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: named exports (models and so on) do not resolve under plain node ESM, so they are reached through default
// (compatible with both Next/webpack and tsx scripts - supporting runs outside the server, such as trading-smoke).
const { Schema, model, models } = mongoose;

// The single source of the live trading strategy list (#354). A relative path rather than the alias (@/) - this model is loaded
// outside Next too (by trading-smoke and the like).
import { LIVE_STRATEGY_IDS } from '../types/trading';

/**
 * An automated-trading portfolio - one account (TradingAccount) holds several market x strategy blocks.
 * It corresponds to python portfolio.yaml's overseas/domestic blocks.
 *
 * market: kr | us
 * strategy: lrs_v1 | rotation_v1 | trend_v1 | infinite_v4 | value_rebalancing (all on KIS and Toss).
 * runAt: "HH:MM" - KST for kr, ET for us (daylight saving automatic, the same meaning as in python).
 * config: the per-strategy parameter JSON
 *   lrs_v1:      { signal, target, sma?, band? }
 *   rotation_v1: { signal, candidates? (omitted = automatic selection from the seeds), sma?, band?, mom?, rebalance? }
 *   trend_v1:    { universe: string[] (an array of symbols), shortMa?, longMa?, positionSize? }
 *   infinite_v4: { symbol, principal (required - the symbol's own principal), splits?, starBase?, sellTarget? }
 *                On the domestic market the runAt (09:30 sell) plus 15:20 buy phases run automatically (the LOC emulation).
 *   value_rebalancing: { symbol, principal (required), gradient (G, required), bandPct?, poolLimitPct?,
 *                cycleDays?, initStockRatio?, cashflow?, feeRate? } - outside the band it rebalances once a day
 *                back to the band's edge. The first run buys the seed at initStockRatio (85% by default). A runAt near the close is recommended.
 * state: the engine's persistent state (rotation's last_rebalance, auto_pool and so on) - replacing python's rotation-state file.
 */
const TradingPortfolioSchema = new Schema(
  {
    accountId: { type: Schema.Types.ObjectId, ref: "TradingAccount", required: true, index: true },
    market: { type: String, required: true, enum: ["kr", "us"] },
    // #354 - it used to be a hand-copied list. In #352 the endings drifted the same way and caused an incident.
    strategy: { type: String, required: true, enum: [...LIVE_STRATEGY_IDS] },
    runAt: { type: String, required: true, default: "09:05" }, // kr=KST, us=ET
    weekdaysOnly: { type: Boolean, default: true },
    enabled: { type: Boolean, default: true },
    // The history of setting changes is held by **TradingPortfolioRevision** (#350).
    // The strategyHistory (#83) that lived here kept the strategy's name alone and no values, so it was no help at all
    // when #348 overwrote the config. Revisions are its superset, so it was removed (they keep the whole value).
    /**
     * The cash this block may use (#339). **Empty (0 or absent) means all of it** - with a single block it runs exactly as before.
     *
     * It became necessary once several blocks could share one account and market. The engines read the account's whole deposit,
     * so without dividing it each block believes "all this money is mine" and tries to spend several times the balance.
     */
    reservedCash: { type: Number, default: 0 },
    config: { type: Schema.Types.Mixed, default: {} },
    state: { type: Schema.Types.Mixed, default: {} },
    // Soft delete - deleting hides the document rather than removing it (recreating reuses and undeletes the same
    // (accountId, market) document). Queries exclude it with { isDeleted: { $ne: true } }.
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// **Several blocks** are allowed per account and market (#339). (accountId, market) used to be unique, so
// "adding" a portfolio quietly replaced the existing one. Only the lookup index is kept.
// Note: mongoose does not drop a DB index when it is removed from the schema -
//   scripts/drop-portfolio-unique-index.mjs has to be run once.
TradingPortfolioSchema.index({ accountId: 1, market: 1 });

export type TradingPortfolioType = InferSchemaType<typeof TradingPortfolioSchema>;

const TradingPortfolio: Model<TradingPortfolioType> =
  models.TradingPortfolio ||
  model<TradingPortfolioType>("TradingPortfolio", TradingPortfolioSchema);

export default TradingPortfolio;
