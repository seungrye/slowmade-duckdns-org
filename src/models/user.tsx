const UserSchema = new mongoose.Schema(
    {
      username: { type: String, required: true, unique: true }, // 유저 닉네임
      email: { type: String, required: true, unique: true }, // 이메일
      password: { type: String, required: true }, // 비밀번호 (해싱 필요)
      profileImage: { type: String }, // 프로필 이미지 URL
      createdAt: { type: Date, default: Date.now }, // 가입일
    },
    { timestamps: true }
  );
  
  module.exports = mongoose.model("User", UserSchema);
  