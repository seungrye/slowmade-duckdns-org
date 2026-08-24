import mongoose, { InferSchemaType, model, models, Schema } from "mongoose";

const UserAchievementSchema = new Schema({
  achievement: { type: mongoose.Schema.Types.ObjectId, ref: 'Achievement', required: true },
  unlockedAt: { type: Date, default: Date.now, required: true }
}, { _id: false });

const UserSettingsSchema = new Schema({
  theme: {
    type: String,
    enum: ['light', 'dark', 'system'],
    default: 'system',
  },
}, { _id: false });

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: false, unique: true }, // 유저 닉네임
    email: { type: String, required: false, unique: true }, // 이메일
    password: { type: String, required: false }, // 비밀번호 (해싱 필요) // optional
    profileImage: { type: String }, // 프로필 이미지 URL
    providers: { type: [String], default: [] }, // 소셜 로그인 제공자 (ex. google, kakao)
    achievements: { type: [UserAchievementSchema], default: [] },
    settings: {
      type: UserSettingsSchema,
      default: () => ({ theme: 'system' }),
    },
    points: { type: Number, default: 0 }, // 사용자 포인트
    likedPosts: { type: [String], default: [] }, // 좋아요한 게시글 ID 목록
    // 덧글 알림 읽음 상태 (#237, #247). 두 값이 함께 판정한다.
    //   기준선  이 시각보다 오래된 것은 무조건 읽음. 없으면(한 번도 안 봤으면) 전부 새 것.
    //           [모두 읽음] 버튼이 now 로 올린다.
    //   개별    기준선보다 새 것 중 **눌러서 처리한** 덧글 id. 방문만으로는 쌓이지 않는다.
    // 기준선 없이 개별 목록만 쓰면 예전 알림이 전부 안 읽음으로 되살아나 뱃지가 터진다.
    notificationsSeenAt: { type: Date },
    notificationsReadIds: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now }, // 가입일
  },
  { timestamps: true }
);

export type UserType = InferSchemaType<typeof UserSchema> & {
  _id: string;
};

export default models.User || model<UserType>("User", UserSchema);
