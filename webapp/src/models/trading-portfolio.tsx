import mongoose from "mongoose";
import type { InferSchemaType, Model } from "mongoose";

// ESM interop: named export(models 등)는 순수 node ESM 에서 안 풀려 default 로 접근한다
// (Next/webpack·tsx 스크립트 양쪽 호환 — trading-smoke 등 서버 외 구동 지원).
const { Schema, model, models } = mongoose;

/**
 * 자동매매 포트폴리오 — 계정(TradingAccount) 1개에 시장×전략 블록 여러 개.
 * 파이썬 portfolio.yaml 의 overseas/domestic 블록에 해당.
 *
 * market: kr | us
 * strategy: lrs_v1 | rotation_v1 | trend_v1 | infinite_v4 | value_rebalancing(모두 KIS·토스).
 * runAt: "HH:MM" — kr 은 KST, us 는 ET(서머타임 자동, 파이썬과 동일 의미).
 * config: 전략별 파라미터 JSON
 *   lrs_v1:      { signal, target, sma?, band? }
 *   rotation_v1: { signal, candidates?(생략=시드 자동선발), sma?, band?, mom?, rebalance? }
 *   trend_v1:    { universe: string[](심볼 배열), shortMa?, longMa?, positionSize? }
 *   infinite_v4: { symbol, principal(필수 — 종목 전용 원금), splits?, starBase?, sellTarget? }
 *                국장은 runAt(09:30 매도)+15:20 매수 phase 가 자동으로 돈다(LOC 에뮬).
 *   value_rebalancing: { symbol, principal(필수), gradient(G,필수), bandPct?, poolLimitPct?,
 *                cycleDays?, initStockRatio?, cashflow?, feeRate? } — 밴드 밖이면 하루 1회
 *                밴드 경계까지 리밸런스. 첫 실행에 initStockRatio(기본 85%)만큼 시드 매수. runAt 종가 근처 권장.
 * state: 엔진 영속 상태(rotation last_rebalance·auto_pool 등) — 파이썬 rotation-state 파일 대체.
 */
const TradingPortfolioSchema = new Schema(
  {
    accountId: { type: Schema.Types.ObjectId, ref: "TradingAccount", required: true, index: true },
    market: { type: String, required: true, enum: ["kr", "us"] },
    strategy: { type: String, required: true, enum: ["lrs_v1", "rotation_v1", "trend_v1", "infinite_v4", "value_rebalancing"] },
    runAt: { type: String, required: true, default: "09:05" }, // kr=KST, us=ET
    weekdaysOnly: { type: Boolean, default: true },
    enabled: { type: Boolean, default: true },
    // 설정 변경 이력은 **TradingPortfolioRevision** 이 들고 있다 (#350).
    // 여기 있던 strategyHistory(#83)는 전략 이름만 남기고 값을 안 남겨, #348 에서 config 가
    // 덮였을 때 아무 도움이 못 됐다. 리비전이 그 상위집합이라 걷어냈다(값 전체를 남긴다).
    /**
     * 이 블록이 쓸 현금 (#339). **비우면(0/없음) 전액** — 블록이 하나뿐이면 예전과 똑같이 돈다.
     *
     * 한 계정·한 시장에 블록을 여럿 두게 되면서 필요해졌다. 엔진들이 계좌 예수금을 통째로
     * 읽으므로, 나눠 주지 않으면 블록마다 "이 돈이 다 내 것" 이라 믿고 잔고의 몇 배를 쓰려 든다.
     */
    reservedCash: { type: Number, default: 0 },
    config: { type: Schema.Types.Mixed, default: {} },
    state: { type: Schema.Types.Mixed, default: {} },
    // 소프트 삭제 — 삭제해도 문서를 지우지 않고 숨긴다(재생성 시 같은 (accountId,market)
    // 문서를 재사용해 undelete). 조회는 { isDeleted: { $ne: true } } 로 제외.
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// 계정·시장당 **여러 블록**을 둘 수 있다 (#339). 예전엔 (accountId, market) 이 unique 라
// 포트폴리오를 "추가" 하면 기존 것이 조용히 교체됐다. 조회용 인덱스만 남긴다.
// ⚠ mongoose 는 스키마에서 뺀다고 DB 인덱스를 지우지 않는다 —
//   scripts/drop-portfolio-unique-index.mjs 를 한 번 돌려야 한다.
TradingPortfolioSchema.index({ accountId: 1, market: 1 });

export type TradingPortfolioType = InferSchemaType<typeof TradingPortfolioSchema>;

const TradingPortfolio: Model<TradingPortfolioType> =
  models.TradingPortfolio ||
  model<TradingPortfolioType>("TradingPortfolio", TradingPortfolioSchema);

export default TradingPortfolio;
