import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: named export 는 순수 node ESM 에서 안 풀려 default 로 접근(tsx 스크립트 호환).
const { Schema, model, models } = mongoose;

/**
 * 매매 기록 — stock-automator reports/{paper,real}/trades.json 동기화.
 *
 * env: "paper" | "real" — 모의/실전 구분.
 * action: "buy" | "sell".
 * strategy: 전략 구분 (예: "infinite" 무한매수 | "trend" 추세추종). v2 가 전송. 빈 문자열=미지정.
 * date: "YYYY-MM-DD" — 차트의 x 축 (일봉 데이터와 join).
 * time: ISO 문자열(마이크로초) — 같은 날 여러 건 구분 + unique 키.
 *
 * 복합 unique: (env, ticker, time). v2 의 time 은 마이크로초라 같은 사이클 다건도 고유.
 */
const StockTradeSchema = new Schema(
  {
    env: { type: String, required: true, enum: ["paper", "real"], index: true },
    ticker: { type: String, required: true, index: true },
    action: { type: String, required: true, enum: ["buy", "sell"] },
    strategy: { type: String, default: "", index: true },
    qty: { type: Number, required: true },
    cumulativeQty: { type: Number, default: 0 }, // 체결 후 종목 누적 보유 수량(전량 매도 뒤 0)
    price: { type: Number, required: true },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: "KRW" },
    date: { type: String, required: true }, // YYYY-MM-DD
    time: { type: String, required: true }, // ISO
    /**
     * 이 체결을 낸 블록 (#372). **주인이 분명할 때만** 채운다.
     *
     * close-sync 는 계좌 전체 체결내역을 받는데, 블록마다 돌면서 그걸 전부 자기 전략으로
     * 태깅하고 있었다 — 미국 계좌에 블록이 둘이 되자 먼저 도는 쪽이 선점했다(2026-09-01
     * SOXL 이 VR 주문인데 infinite_v4 로 기록). 종목의 주인이 정확히 하나일 때만 붙인다.
     * 주인이 없거나 겹치면 null 로 두고 계좌 귀속으로 남긴다.
     */
    portfolioId: { type: Schema.Types.ObjectId, ref: "TradingPortfolio", default: null, index: true },
    // 소프트 삭제 — 포트폴리오 삭제 시 (env,currency) 기록을 숨긴다(하드 삭제 아님, 복구 가능).
    // 미설정(undefined)=표시. 조회는 { hidden: { $ne: true } } 로 제외.
    hidden: { type: Boolean, default: false },
  },
  { timestamps: true },
);

StockTradeSchema.index({ env: 1, ticker: 1, time: 1 }, { unique: true });
StockTradeSchema.index({ ticker: 1, date: 1 });

export type StockTradeType = InferSchemaType<typeof StockTradeSchema>;

const StockTrade: Model<StockTradeType> =
  models.StockTrade ||
  model<StockTradeType>("StockTrade", StockTradeSchema);

export default StockTrade;
