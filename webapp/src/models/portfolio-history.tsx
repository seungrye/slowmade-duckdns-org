import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: named export 는 순수 node ESM 에서 안 풀려 default 로 접근(tsx 스크립트 호환).
const { Schema, model, models } = mongoose;

/**
 * 포트폴리오 시계열 — stock-automator reports/{paper,real}/portfolio_history.json 동기화.
 *
 * env: "paper" | "real"
 * currency: "KRW" | "USD" — 국장/미장 분리
 * date: ISO timestamp (사이클 끝 시점) — 같은 날 여러 사이클 가능
 * dateStr: "YYYY-MM-DD" — 차트 x 축 + 매매 join key
 *
 * unique: (env, currency, date)
 */
const PortfolioHistorySchema = new Schema(
  {
    env: { type: String, required: true, enum: ["paper", "real"], index: true },
    currency: { type: String, required: true, default: "KRW", index: true },
    date: { type: String, required: true }, // ISO
    dateStr: { type: String, required: true, index: true }, // YYYY-MM-DD
    totalValue: { type: Number, required: true },
    cash: { type: Number, default: 0 },
    holdingsValue: { type: Number, default: 0 },
    runPnl: { type: Number, default: 0 },
    cumulativePnl: { type: Number, default: 0 },
    /**
     * 블록 행이면 그 블록의 id (#367). **계좌 행은 이 필드가 없다.**
     *
     * 계정·시장에 블록이 여럿이면(미국: TQQQ v4 + SOXL VR) 계좌 값 하나로는 구분이 안 된다.
     * 계좌 행은 그대로 두고 블록 행을 더한다 — 옛 조회는 `portfolioId: null` 로 걸러 쓴다.
     */
    portfolioId: { type: Schema.Types.ObjectId, ref: "TradingPortfolio", default: null, index: true },
    /** 블록 행의 전략(화면 라벨용). 계좌 행은 빈 값. */
    strategy: { type: String, default: "" },
    // 소프트 삭제 — 포트폴리오 삭제 시 (env,currency) 스냅샷을 숨긴다(복구 가능). 조회는 { hidden: { $ne: true } }.
    hidden: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// portfolioId 를 키에 넣는다 (#367). 기존 문서는 이 필드가 없어 null 로 묶이므로 계좌 행은
// 예전처럼 하루 하나다. ⚠ mongoose 는 옛 인덱스를 안 지운다 —
// scripts/drop-portfolio-history-index.mjs 를 한 번 돌려야 한다.
PortfolioHistorySchema.index(
  { env: 1, currency: 1, portfolioId: 1, date: 1 },
  { unique: true },
);

export type PortfolioHistoryType = InferSchemaType<typeof PortfolioHistorySchema>;

const PortfolioHistory: Model<PortfolioHistoryType> =
  models.PortfolioHistory ||
  model<PortfolioHistoryType>("PortfolioHistory", PortfolioHistorySchema);

export default PortfolioHistory;
