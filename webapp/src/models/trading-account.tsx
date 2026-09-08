import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: named exports (models and so on) do not resolve under plain node ESM, so they are reached through default
// (compatible with both Next/webpack and tsx scripts - supporting runs outside the server, such as trading-smoke).
const { Schema, model, models } = mongoose;

/**
 * A broker account for automated trading - several can be registered under my page > settings (the python stock-automator-v2's
 * portfolio.yaml account block, moved into the DB).
 *
 * broker: kis (Korea Investment) | toss (Toss Securities)
 * env: kis is paper|real (branching the host and TR); toss is live-account only and is fixed at "toss".
 * credentials: an AES-256-GCM encrypted blob per field (lib/trading/crypto) - never stored in plain text,
 *   and the API responses carry masked values only.
 *   kis: appKey, appSecret, accountNo / toss: clientId, clientSecret [, accountSeq (a plain number)]
 * liveEnabled: the live-order toggle (false = dry-run by default). Live orders require it AND the server env
 *   TRADING_LIVE_ALLOWED=true (a double gate).
 * envKey: the key separating the ledger, charts and state (the same rule as python's: "{env}-{label}", e.g. paper-50194613,
 *   toss-main) - the join key for a per-account trade chart query.
 */
const TradingAccountSchema = new Schema(
  {
    ownerEmail: { type: String, required: true, index: true },
    broker: { type: String, required: true, enum: ["kis", "toss"] },
    env: { type: String, required: true, enum: ["paper", "real", "toss"] },
    name: { type: String, required: true }, // 라벨(계좌번호 뒷자리·별칭 등)
    envKey: { type: String, required: true, unique: true },
    credentials: { type: Schema.Types.Mixed, required: true }, // {필드: 암호화블롭}
    liveEnabled: { type: Boolean, default: false },
    memo: { type: String, default: "" },
    // Soft delete - deleting hides the document rather than removing it. envKey being unique, recreating with the same envKey
    // reuses (undeletes) the soft-deleted document. Queries use { isDeleted: { $ne: true } }.
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type TradingAccountType = InferSchemaType<typeof TradingAccountSchema>;

const TradingAccount: Model<TradingAccountType> =
  models.TradingAccount ||
  model<TradingAccountType>("TradingAccount", TradingAccountSchema);

export default TradingAccount;
