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
    // 표시용 닉네임. **unique 를 걸지 않는다** (#478) — 걸어 두면 이름이 같은 사람은
    // 뒤에 오는 쪽이 아예 가입을 못 한다. auth.ts 의 signIn 콜백이 새 문서를 저장하다
    // E11000 으로 터지고 NextAuth 가 AccessDenied 를 낸다. 실제로 그렇게 막혔었다.
    // 계정 식별자는 아래 email 이고, username 으로 조회하는 코드는 없다.
    username: { type: String, required: false }, // 유저 닉네임
    email: { type: String, required: false, unique: true }, // 이메일 — 계정 식별자
    password: { type: String, required: false }, // 비밀번호 (해싱 필요) // optional
    profileImage: { type: String }, // 프로필 이미지 URL
    providers: { type: [String], default: [] }, // 소셜 로그인 제공자 (ex. google, kakao)
    achievements: { type: [UserAchievementSchema], default: [] },
    settings: {
      type: UserSettingsSchema,
      default: () => ({ theme: 'system' }),
    },
    points: { type: Number, default: 0 }, // 사용자 포인트
    // 생일 (#326). 'YYYY-MM-DD' 를 **UTC 자정**으로 저장하고 월·일도 UTC 게터로 읽는다.
    // 로컬 시각으로 만들면 KST 사용자의 1990-03-15 가 UTC 03-14T15:00Z 가 되어 하루 밀린다.
    birthday: { type: Date },
    // 태어난 시 "HH:mm" (#390) — 선택. 있으면 사주 시주(時柱)까지 계산. 없으면 3주만.
    birthTime: { type: String, default: undefined },
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
