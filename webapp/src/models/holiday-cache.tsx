import mongoose, { InferSchemaType, model, models, Schema } from "mongoose";

/**
 * 특일 정보 연 단위 캐시 (#328).
 *
 * 주기 작업(스케줄러)을 새로 만들지 않는다. 필요할 때 해당 연도가 없으면 그 자리에서 받아
 * 채운다 — 재시작·배포에 영향받지 않고 스스로 낫는다.
 *
 * `fetchedAt` 은 만료 판단용이다. 연 1회로는 부족한데, **임시공휴일이 연중에 새로 지정**되기
 * 때문이다(lib/calendar/cache.ts 의 STALE_AFTER_MS).
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
