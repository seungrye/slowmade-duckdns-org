// Assembles the trade-record upsert document - pure functions (#77).
//
// close-sync **re-pushes** the most recent N records at every close (for idempotency). The problem was that the
// strategy it attached was "the strategy configured on the portfolio right now", not "the strategy that made the trade".
// Switching strategies only changes one portfolio document's strategy field, so every re-push after the switch
// overwrote the tags on past records with the new strategy (the incident where all 127 became infinite_v4).
//
// So strategy is written **only on first insert** and never touched again ($setOnInsert).
// Values like price, quantity and cumulative quantity can be corrected, so they keep updating ($set).
//
// It is split out as a pure function that knows nothing of the DB for testability - close-sync imports mongoose
// models and the KIS client at the top level, which makes it hard to wrap in a unit test.
import { normalizeTradeTime } from "@/lib/trade-time";
// Only Types is used (no connection) - keeping the casting in this one place where it is assembled.
import { Types } from "mongoose";

type Json = Record<string, unknown>;

export interface TradeUpsertOp {
  updateOne: {
    filter: { env: unknown; ticker: unknown; time: string };
    update: { $set: Json; $setOnInsert?: Json };
    upsert: true;
  };
}

/**
 * Turns one fill record into an updateOne operation for bulkWrite.
 * The unique key is (env, ticker, time) - the same key the ingest API uses.
 */
export function buildTradeUpsertOp(record: Json): TradeUpsertOp {
  const { strategy, portfolioId, ...rest } = record;
  const time = normalizeTradeTime(String(record.time));
  const update: { $set: Json; $setOnInsert?: Json } = { $set: { ...rest, time } };
  // A record with an unknown strategy gets no empty value written - leaving room to fill it in later.
  if (strategy !== undefined && strategy !== null && strategy !== "") {
    update.$setOnInsert = { strategy };
  }
  // Block attribution (#372) is **correctable**, unlike strategy - deleting and recreating a block changes its
  // id, and the re-push has to follow. But **when the owner is unknown it is left alone**:
  // $set of null would wipe, at the next close, the attribution a correction script had attached.
  //
  // It must be written as an ObjectId (#384). This operation goes through `StockTrade.collection.bulkWrite`
  //   (the raw driver), and **there is no mongoose casting there** - give it a string and
  //   a string is stored. A query (`StockTrade.find({ portfolioId })`), meanwhile, is cast to
  //   an ObjectId per the schema, so **not a single row matches.** In practice the close sync
  //   overwrote 148 corrected records with strings, and the per-block trade detail came back empty
  //   with "there is no price data for the traded symbols".
  if (portfolioId !== undefined && portfolioId !== null) {
    update.$set.portfolioId =
      typeof portfolioId === "string" && Types.ObjectId.isValid(portfolioId)
        ? new Types.ObjectId(portfolioId)
        : portfolioId;
  }
  return {
    updateOne: {
      filter: { env: record.env, ticker: record.ticker, time },
      update,
      upsert: true,
    },
  };
}
