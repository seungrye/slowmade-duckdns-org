import { InferSchemaType, Schema, model, models } from "mongoose";

const AchievementSchema = new Schema({
  key: { type: String, required: true, unique: true }, // e.g., 'FIRST_POST'
  name: { type: String, required: true }, // e.g., '첫 글 작성'
  description: { type: String, required: true }, // e.g., '처음으로 게시글을 작성했습니다.'
  icon: { type: String, required: true }, // e.g., 'FaPencilAlt' or an image URL
  points: { type: Number, required: true, default: 0 }, // e.g., 10
  // 등급·숨김 (#333). 정의(lib/achievements/definitions.ts)에서 upsert 로 흘러 들어온다 —
  // 스키마에 없으면 mongoose 가 조용히 버려서 화면이 전부 같은 등급으로 보인다.
  tier: { type: String, enum: ['bronze', 'silver', 'gold'], default: 'bronze' },
  hidden: { type: Boolean, default: false },
});

export type AchievementType = InferSchemaType<typeof AchievementSchema> & {
  _id: string;
};

export default models.Achievement || model("Achievement", AchievementSchema);
