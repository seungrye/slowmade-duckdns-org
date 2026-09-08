import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: named exports (models and so on) do not resolve under plain node ESM, so they are reached through default
// (compatible with both Next/webpack and tsx scripts - supporting runs outside the server, such as trading-smoke).
const { Schema, model, models } = mongoose;

/**
 * The record of a trading cycle's run = **the ledger of idempotence**.
 *
 * (portfolioId, dateKey, phase) is unique - the scheduler claims it atomically, guaranteeing one run a day per phase.
 * Even when a blue-green deploy leaves the old and new instances coexisting briefly, and even when a restart and a catch-up
 * overlap, it never runs twice (matching the python daemon's "once a day plus the cancel safety net").
 *
 * dateKey: "YYYY-MM-DD" in the market's tz (the ET date for us) - avoiding the US market's midnight rollover problem.
 * status: running -> done | failed. A running left longer than STALE_MS (a crash) may be
 *   reclaimed (treated as abandoned) - the orders are either dry-run or, when live, only inside the claim.
 * catchUp: marks a cycle run from the "past its run time and not run" detection at startup.
 */
const TradingRunSchema = new Schema(
  {
    portfolioId: { type: Schema.Types.ObjectId, ref: "TradingPortfolio", required: true },
    accountId: { type: Schema.Types.ObjectId, ref: "TradingAccount", required: true, index: true },
    dateKey: { type: String, required: true }, // 시장 tz 기준 YYYY-MM-DD
    phase: { type: String, default: "main" }, // main|both|sell|buy — 국장 v4 는 sell/buy 2사이클
    status: { type: String, required: true, enum: ["running", "done", "failed"], default: "running" },
    dryRun: { type: Boolean, default: true },
    catchUp: { type: Boolean, default: false },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    summary: { type: String, default: "" }, // 사람이 읽는 결과 한 줄
    error: { type: String, default: "" },
    logs: { type: [String], default: [] }, // 진행 로그(메일 첨부 대응)
  },
  { timestamps: true },
);

TradingRunSchema.index({ portfolioId: 1, dateKey: 1, phase: 1 }, { unique: true });

export type TradingRunType = InferSchemaType<typeof TradingRunSchema>;

const TradingRun: Model<TradingRunType> =
  models.TradingRun || model<TradingRunType>("TradingRun", TradingRunSchema);

export default TradingRun;
