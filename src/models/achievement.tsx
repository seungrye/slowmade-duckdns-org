import { InferSchemaType, Schema, model, models } from "mongoose";

const AchievementSchema = new Schema({
  key: { type: String, required: true, unique: true }, // e.g., 'FIRST_POST'
  name: { type: String, required: true }, // e.g., '첫 글 작성'
  description: { type: String, required: true }, // e.g., '처음으로 게시글을 작성했습니다.'
  icon: { type: String, required: true }, // e.g., 'FaPencilAlt' or an image URL
  points: { type: Number, required: true, default: 0 }, // e.g., 10
});

export type AchievementType = InferSchemaType<typeof AchievementSchema> & {
  _id: string;
};

export default models.Achievement || model("Achievement", AchievementSchema);
