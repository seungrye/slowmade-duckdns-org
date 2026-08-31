// TradingPortfolioRevision — 포트폴리오 설정을 바꾸거나 추가·삭제할 때마다 그 시점 값 (#350).
//
// models/web-adventure-scene-revision 패턴을 그대로 차용:
//   - 대상 id 별 version 1 부터 sequential 증가, 다른 id 끼리 독립 sequence.
//   - snapshot 은 Schema.Types.Mixed (config 가 전략마다 자유 구조).
//   - 쓰는 쪽은 한 곳 — api/my/trading/portfolios/route.ts 의 POST·DELETE.
//
// 왜 만들었나: #348 에서 전략을 갈아타자 예전 config 가 통째로 덮여 사라졌다. 백업도 oplog 도
// 없어 15 거래일치 주문로그·체결을 floor() 제약으로 역산해야 했다. strategyHistory(#83)는
// "언제 무엇에서 무엇으로" 만 남기고 값을 안 남겨 소용이 없었다 — 이 모델이 그것을 대체한다.

import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: 다른 trading 모델들과 같은 이유로 default 로 접근한다.
const { Schema, model, models } = mongoose;

const TradingPortfolioRevisionSchema = new Schema(
  {
    portfolioId: { type: Schema.Types.ObjectId, ref: "TradingPortfolio", required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: "TradingAccount", required: true },
    // portfolioId 별 1 부터.
    version: { type: Number, required: true },
    action: { type: String, required: true, enum: ["create", "update", "delete"] },
    /**
     * 그 변경 **후**의 설정 전체 — market·strategy·runAt·weekdaysOnly·enabled·reservedCash·config.
     * 무엇이 들어가는지는 lib/trading/portfolio-revision.snapshotOf 가 화이트리스트로 정한다.
     *
     * ⚠ state 는 담지 않는다. 엔진이 매 실행마다 고치는 값이라(T·cycleCash·lastRunDate) 담으면
     *   설정을 안 건드린 날도 리비전이 쌓여 이력이 쓸모없어진다.
     */
    snapshot: { type: Schema.Types.Mixed, required: true },
    // 바뀐 키 목록 — 목록에서 무엇이 바뀌었는지 펴 보지 않고 알려고. 추가(create)면 빈 배열.
    changed: { type: [String], default: [] },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { collection: "tradingportfoliorevisions" },
);

// 목록은 늘 "이 블록의 최신순" 이다.
TradingPortfolioRevisionSchema.index({ portfolioId: 1, version: -1 });

export type TradingPortfolioRevisionType = InferSchemaType<typeof TradingPortfolioRevisionSchema>;

const TradingPortfolioRevision: Model<TradingPortfolioRevisionType> =
  models.TradingPortfolioRevision ||
  model<TradingPortfolioRevisionType>("TradingPortfolioRevision", TradingPortfolioRevisionSchema);

export default TradingPortfolioRevision;
