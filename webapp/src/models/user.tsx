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
    // The birthday (#326). 'YYYY-MM-DD' is stored as **UTC midnight** and the month and day are read with the UTC getters.
    // Built in local time, a KST user's 1990-03-15 becomes UTC 03-14T15:00Z and slips a day.
    birthday: { type: Date },
    // The hour of birth, "HH:mm" (#390) - optional. With it the saju's hour pillar is computed too; without it, only 3 pillars.
    birthTime: { type: String, default: undefined },
    likedPosts: { type: [String], default: [] }, // 좋아요한 게시글 ID 목록
    // The read state of the comment notifications (#237, #247). The two values decide it together.
    //   the baseline  anything older than this time counts as read. Absent (never looked), everything is new.
    //           The [mark all read] button raises it to now.
    //   individual    the ids of comments newer than the baseline that were **pressed and handled**. A visit alone does not accumulate them.
    // With the individual list alone and no baseline, every old notification comes back as unread and the badge explodes.
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
