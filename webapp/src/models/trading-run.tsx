import { InferSchemaType, Schema, model, models, Model } from "mongoose";

/**
 * 매매 사이클 실행 기록 = **멱등성의 원장**.
 *
 * (portfolioId, dateKey, phase) unique — 스케줄러가 원자 클레임해 phase당 하루 1회를
 * 보장한다. 블루그린 배포로 구/신 인스턴스가 잠깐 공존해도, 재시작·catch-up 이
 * 겹쳐도 두 번 실행되지 않는다(파이썬 데몬의 "하루 1회 + cancel 안전망" 대응).
 *
 * dateKey: 시장 tz 기준 "YYYY-MM-DD"(us 는 ET 날짜) — 미장 자정 넘김 문제 방지.
 * status: running → done | failed. running 이 STALE_MS 넘게 방치되면(크래시)
 *   재클레임 허용(abandoned 처리) — 주문은 dry-run 이거나 live 도 클레임 안에서만.
 * catchUp: 기동 시 "런 시각 경과 & 미실행" 감지로 돌린 사이클 표시.
 */
const TradingRunSchema = new Schema(
  {
    portfolioId: { type: Schema.Types.ObjectId, ref: "TradingPortfolio", required: true },
    accountId: { type: Schema.Types.ObjectId, ref: "TradingAccount", required: true, index: true },
    dateKey: { type: String, required: true }, // 시장 tz 기준 YYYY-MM-DD
    phase: { type: String, default: "main" }, // main|both|sell|buy — 국장 v4 는 sell/buy 2사이클
    status: { type: String, required: true, enum: ["running", "done", "failed"], default: "running" },
    dryRun: { type: Boolean, default: true },
    catchUp: { type: Boolean, default: false },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    summary: { type: String, default: "" }, // 사람이 읽는 결과 한 줄
    error: { type: String, default: "" },
    logs: { type: [String], default: [] }, // 진행 로그(메일 첨부 대응)
  },
  { timestamps: true },
);

TradingRunSchema.index({ portfolioId: 1, dateKey: 1, phase: 1 }, { unique: true });

export type TradingRunType = InferSchemaType<typeof TradingRunSchema>;

const TradingRun: Model<TradingRunType> =
  models.TradingRun || model<TradingRunType>("TradingRun", TradingRunSchema);

export default TradingRun;
