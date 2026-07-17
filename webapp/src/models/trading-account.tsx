import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: named export(models 등)는 순수 node ESM 에서 안 풀려 default 로 접근한다
// (Next/webpack·tsx 스크립트 양쪽 호환 — trading-smoke 등 서버 외 구동 지원).
const { Schema, model, models } = mongoose;

/**
 * 자동매매 증권사 계정 — 마이페이지>설정에서 다수 등록(파이썬 stock-automator-v2 의
 * portfolio.yaml account 블록을 DB 로 옮긴 것).
 *
 * broker: kis(한국투자) | toss(토스증권)
 * env: kis 는 paper|real(호스트·TR 분기), toss 는 실계좌 전용이라 "toss" 고정.
 * credentials: 필드별 AES-256-GCM 암호화 블롭(lib/trading/crypto) — 평문 저장 금지,
 *   API 응답에도 마스킹 값만 나간다.
 *   kis: appKey, appSecret, accountNo / toss: clientId, clientSecret [, accountSeq(평문 숫자)]
 * liveEnabled: 실주문 토글(기본 false=dry-run). 서버 env TRADING_LIVE_ALLOWED=true 와
 *   AND 로만 실주문(이중 게이트).
 * envKey: 원장·차트·상태 분리 키(파이썬과 동일 규칙: "{env}-{label}" 예: paper-50194613,
 *   toss-주계좌) — 계정별 매매 차트 조회의 조인 키.
 */
const TradingAccountSchema = new Schema(
  {
    ownerEmail: { type: String, required: true, index: true },
    broker: { type: String, required: true, enum: ["kis", "toss"] },
    env: { type: String, required: true, enum: ["paper", "real", "toss"] },
    name: { type: String, required: true }, // 라벨(계좌번호 뒷자리·별칭 등)
    envKey: { type: String, required: true, unique: true },
    credentials: { type: Schema.Types.Mixed, required: true }, // {필드: 암호화블롭}
    liveEnabled: { type: Boolean, default: false },
    memo: { type: String, default: "" },
    // 소프트 삭제 — 삭제해도 문서를 지우지 않고 숨긴다. envKey 가 unique 라 같은 envKey 로
    // 재생성 시엔 소프트 삭제된 문서를 재사용(undelete)한다. 조회는 { isDeleted: { $ne: true } }.
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type TradingAccountType = InferSchemaType<typeof TradingAccountSchema>;

const TradingAccount: Model<TradingAccountType> =
  models.TradingAccount ||
  model<TradingAccountType>("TradingAccount", TradingAccountSchema);

export default TradingAccount;
