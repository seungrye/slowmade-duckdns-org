import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: named exports (models and so on) do not resolve under plain node ESM, so they are reached through default
// (compatible with both Next/webpack and tsx scripts - supporting runs outside the server, such as trading-smoke).
const { Schema, model, models } = mongoose;

/**
 * The broker access token cache - Mongo rather than a file cache (shared by the two blue-green instances,
 * avoiding a clash with KIS's one-issue-per-minute limit). cacheKey examples: "kis:paper:PSxxxxxx", "toss:cid12345".
 */
const TradingTokenSchema = new Schema(
  {
    cacheKey: { type: String, required: true, unique: true },
    token: { type: String, required: true },
    expiresAt: { type: Number, required: true }, // epoch ms
  },
  { timestamps: true },
);

export type TradingTokenType = InferSchemaType<typeof TradingTokenSchema>;

const TradingToken: Model<TradingTokenType> =
  models.TradingToken || model<TradingTokenType>("TradingToken", TradingTokenSchema);

export default TradingToken;
