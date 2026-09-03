import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: named export 는 순수 node ESM 에서 안 풀려 default 로 접근(tsx 스크립트 호환).
const { Schema, model, models } = mongoose;

/**
 * 오늘의 운세(타로) — 사용자·날짜별 하루 한 장 (#388).
 *
 * dateKey 는 **KST 'YYYY-MM-DD'** — 자정 경계를 서울 기준으로 본다(사이트 사용자 기준).
 * 카드·방향은 draw.ts 가 (email, dateKey) 로 결정론적으로 정하므로 이 문서가 없어도 재현되지만,
 * **풀이(reading)와 열람 여부(seenAt)** 는 여기에만 있다.
 *
 * status:
 *   pending  — 카드는 정해졌고 풀이는 아직 템플릿(밤 배치가 LLM 으로 채우기 전)
 *   ready    — LLM 풀이까지 채워짐
 *   failed   — LLM 실패로 템플릿 확정(재시도 안 함)
 *
 * seenAt 이 **하루 1회 판정의 서버 필드** — 우하단 토스트는 오늘 문서의 seenAt 이 없을 때만 뜬다.
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
  },
  { timestamps: true },
);

// 사용자·날짜당 하나. get-or-create 와 배치 upsert 의 멱등 키.
DailyFortuneSchema.index({ userEmail: 1, dateKey: 1 }, { unique: true });

export type DailyFortuneType = InferSchemaType<typeof DailyFortuneSchema>;

const DailyFortune: Model<DailyFortuneType> =
  models.DailyFortune || model<DailyFortuneType>("DailyFortune", DailyFortuneSchema);

export default DailyFortune;
