import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: a named export does not resolve under plain node ESM, so it is reached through default (for tsx script compatibility).
const { Schema, model, models } = mongoose;

/**
 * The daily fortune (tarot) - one card a day per user and date (#388).
 *
 * dateKey is **a KST 'YYYY-MM-DD'** - the midnight boundary is Seoul's (the site's users').
 * The card and its orientation are decided deterministically by draw.ts from (email, dateKey) and so are reproducible without this document,
 * but **the reading and whether it was seen (seenAt)** exist only here.
 *
 * status:
 *   pending  - the card is decided and the reading is still the template (before the night batch fills it in with the LLM)
 *   ready    - the LLM's reading is filled in
 *   failed   - the LLM failed and the template is final (no retry)
 *
 * seenAt is **the server field for the once-a-day check** - the bottom-right toast appears only when today's document has no seenAt.
 */
const DailyFortuneSchema = new Schema(
  {
    userEmail: { type: String, required: true, index: true },
    dateKey: { type: String, required: true }, // KST YYYY-MM-DD
    cardId: { type: Number, required: true }, // 0-77
    orientation: { type: String, required: true, enum: ["up", "rev"] },
    reading: { type: String, default: "" },
    readingSource: { type: String, enum: ["llm", "template"], default: "template" },
    status: { type: String, enum: ["pending", "ready", "failed"], default: "pending" },
    seenAt: { type: Date, default: null },
    // The saju reading (#390) - for users with a birthday only. The same document and the same day as the tarot.
    // The saju chart and day stem are recomputed from the birthday every time (deterministically) and so are not stored; only the LLM's reading is cached.
    sajuReading: { type: String, default: "" },
    sajuSource: { type: String, enum: ["llm", "template"], default: "template" },
    sajuStatus: { type: String, enum: ["pending", "ready", "failed", "none"], default: "none" },
  },
  { timestamps: true },
);

// One per user and date. The idempotency key for get-or-create and the batch upsert.
DailyFortuneSchema.index({ userEmail: 1, dateKey: 1 }, { unique: true });

export type DailyFortuneType = InferSchemaType<typeof DailyFortuneSchema>;

const DailyFortune: Model<DailyFortuneType> =
  models.DailyFortune || model<DailyFortuneType>("DailyFortune", DailyFortuneSchema);

export default DailyFortune;
