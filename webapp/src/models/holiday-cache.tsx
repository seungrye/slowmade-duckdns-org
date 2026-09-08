import mongoose, { InferSchemaType, model, models, Schema } from "mongoose";

/**
 * The per-year cache of the special-days information (#328).
 *
 * No new periodic job (scheduler) is created. When a year is missing at the moment it is needed, it is fetched
 * and filled in there and then - unaffected by restarts and deploys, and self-healing.
 *
 * `fetchedAt` decides expiry. Once a year is not enough, because **a temporary public holiday can be designated
 * mid-year** (STALE_AFTER_MS in lib/calendar/cache.ts).
 */
const CalendarDaySchema = new Schema(
  {
    date: { type: String, required: true }, // KST 기준 양력 'YYYY-MM-DD'
    name: { type: String, required: true }, // API 가 준 이름. 예: '설날'
    kind: { type: String, enum: ['holiday', 'anniversary', 'season'], required: true },
  },
  { _id: false }
);

const HolidayCacheSchema = new mongoose.Schema({
  year: { type: Number, required: true, unique: true },
  fetchedAt: { type: Date, required: true },
  days: { type: [CalendarDaySchema], default: [] },
});

export type HolidayCacheType = InferSchemaType<typeof HolidayCacheSchema> & { _id: string };

export default models.HolidayCache || model<HolidayCacheType>("HolidayCache", HolidayCacheSchema);
