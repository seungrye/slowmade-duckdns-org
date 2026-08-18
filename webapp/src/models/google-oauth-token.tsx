// 구글 OAuth 토큰 보관 (#181 2단계).
//
// **User 문서에 붙이지 않고 별도 컬렉션으로 둔다.** User 는 프로필·목록 등 여기저기서 읽히는데,
// 비밀을 실어 두면 언젠가 응답에 섞여 나간다. 여기는 서버 코드만 읽는다.
//
// 파일 캐시가 아니라 Mongo 인 이유는 `TradingToken` 과 같다 — 블루/그린 두 인스턴스가
// 같은 토큰을 봐야 한다.
//
// 값은 평문으로 두지 않는다. 매매 계좌 자격증명과 **같은 방식**(AES-256-GCM,
// `TRADING_SECRET_KEY`)으로 암호화해 넣는다 — `src/lib/trading/crypto.ts`.

import mongoose from 'mongoose';
import type { InferSchemaType, Model } from 'mongoose';

const { Schema, model, models } = mongoose;

const GoogleOAuthTokenSchema = new Schema(
  {
    userEmail: { type: String, required: true, unique: true, index: true },
    /** 오래 사는 것 — 이게 있어야 사용자 재로그인 없이 access token 을 다시 받는다. */
    refreshTokenEnc: { type: String, required: true },
    /** 한 시간짜리 — 만료되면 refresh 로 다시 받는다. 없을 수도 있다. */
    accessTokenEnc: { type: String, default: '' },
    /** access token 만료 시각(epoch ms). */
    expiresAt: { type: Number, default: 0 },
    /** 동의받은 범위 — 나중에 범위를 넓혔을 때 재동의가 필요한지 판단할 근거. */
    scope: { type: String, default: '' },
  },
  { timestamps: true },
);

export type GoogleOAuthTokenType = InferSchemaType<typeof GoogleOAuthTokenSchema>;

const GoogleOAuthToken: Model<GoogleOAuthTokenType> =
  models.GoogleOAuthToken || model<GoogleOAuthTokenType>('GoogleOAuthToken', GoogleOAuthTokenSchema);

export default GoogleOAuthToken;
