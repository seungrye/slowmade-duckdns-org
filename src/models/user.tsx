import mongoose, { Schema, model, models } from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: false, unique: true }, // 유저 닉네임
    email: { type: String, required: false, unique: true }, // 이메일
    password: { type: String, required: false }, // 비밀번호 (해싱 필요) // optional
    profileImage: { type: String }, // 프로필 이미지 URL
    providers: { type: [String], default: [] }, // 소셜 로그인 제공자 (ex. google, kakao)
    createdAt: { type: Date, default: Date.now }, // 가입일
  },
  { timestamps: true }
);

export default models.User || model("User", UserSchema);
