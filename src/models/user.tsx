import mongoose, { InferSchemaType, model, models } from "mongoose";

const UserAchievementSchema = new mongoose.Schema({
  achievement: { type: mongoose.Schema.Types.ObjectId, ref: 'Achievement', required: true },
  unlockedAt: { type: Date, default: Date.now, required: true }
}, { _id: false });

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: false, unique: true }, // 유저 닉네임
    email: { type: String, required: false, unique: true }, // 이메일
    password: { type: String, required: false }, // 비밀번호 (해싱 필요) // optional
    profileImage: { type: String }, // 프로필 이미지 URL
    providers: { type: [String], default: [] }, // 소셜 로그인 제공자 (ex. google, kakao)
    achievements: { type: [UserAchievementSchema], default: [] },
    points: { type: Number, default: 0 }, // 사용자 포인트
    createdAt: { type: Date, default: Date.now }, // 가입일
  },
  { timestamps: true }
);

export type UserType = InferSchemaType<typeof UserSchema> & {
  _id: string;
};

export default models.User || model<UserType>("User", UserSchema);
