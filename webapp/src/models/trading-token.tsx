import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: named export(models 등)는 순수 node ESM 에서 안 풀려 default 로 접근한다
// (Next/webpack·tsx 스크립트 양쪽 호환 — trading-smoke 등 서버 외 구동 지원).
const { Schema, model, models } = mongoose;

/**
 * 브로커 액세스 토큰 캐시 — 파일 캐시 대신 Mongo(블루그린 두 인스턴스 공유,
 * KIS 발급 제한 1분 1회 충돌 방지). cacheKey 예: "kis:paper:PSxxxxxx", "toss:cid12345".
 */
const TradingTokenSchema = new Schema(
  {
    cacheKey: { type: String, required: true, unique: true },
    token: { type: String, required: true },
    expiresAt: { type: Number, required: true }, // epoch ms
  },
  { timestamps: true },
);

export type TradingTokenType = InferSchemaType<typeof TradingTokenSchema>;

const TradingToken: Model<TradingTokenType> =
  models.TradingToken || model<TradingTokenType>("TradingToken", TradingTokenSchema);

export default TradingToken;
