// 매매기록 upsert 문서 조립 — 순수 함수 (#77).
//
// close-sync 는 마감마다 최근 N 건을 **재푸시**한다(멱등성 목적). 문제는 붙이는 전략이
// "그 거래가 난 전략"이 아니라 "포트폴리오에 지금 설정된 전략"이라는 점이었다.
// 포트폴리오 문서 하나의 strategy 필드만 바꿔 전략을 갈아타므로, 전환 이후의 재푸시가
// 과거 기록의 태그까지 전부 새 전략으로 덮어썼다(127 건이 모두 infinite_v4 가 된 사고).
//
// 그래서 strategy 는 **최초 삽입 때만** 쓰고 이후에는 손대지 않는다($setOnInsert).
// 가격·수량·누적수량 같은 값은 정정될 수 있으므로 계속 갱신한다($set).
//
// DB 를 모르는 순수 함수로 떼어 둔 이유는 테스트 때문이다 — close-sync 는 mongoose 모델과
// KIS 클라이언트를 최상위에서 끌어와 단위 테스트로 감싸기 어렵다.
import { normalizeTradeTime } from "@/lib/trade-time";
// Types 만 쓴다(연결 없음) — 캐스팅을 조립하는 이 한 곳에 두려는 것이다.
import { Types } from "mongoose";

type Json = Record<string, unknown>;

export interface TradeUpsertOp {
  updateOne: {
    filter: { env: unknown; ticker: unknown; time: string };
    update: { $set: Json; $setOnInsert?: Json };
    upsert: true;
  };
}

/**
 * 체결 레코드 하나를 bulkWrite 용 updateOne 연산으로 만든다.
 * 고유키는 (env, ticker, time) — ingest API 와 같은 키를 쓴다.
 */
export function buildTradeUpsertOp(record: Json): TradeUpsertOp {
  const { strategy, portfolioId, ...rest } = record;
  const time = normalizeTradeTime(String(record.time));
  const update: { $set: Json; $setOnInsert?: Json } = { $set: { ...rest, time } };
  // 전략을 모르는 레코드에 빈 값을 박아 두지 않는다 — 나중에 채울 여지를 남긴다.
  if (strategy !== undefined && strategy !== null && strategy !== "") {
    update.$setOnInsert = { strategy };
  }
  // 블록 귀속(#372)은 strategy 와 달리 **정정 가능**하다 — 블록을 지웠다 다시 만들면
  // id 가 바뀌므로 재푸시가 따라와야 한다. 다만 **주인을 모를 때는 손대지 않는다**:
  // null 을 $set 하면 교정 스크립트가 붙여 둔 귀속을 다음 마감에 다시 지워 버린다.
  //
  // ⚠ 반드시 ObjectId 로 박는다 (#384). 이 연산은 `StockTrade.collection.bulkWrite`
  //   (원시 드라이버)로 나가는데 **거기엔 mongoose 캐스팅이 없다** — 문자열을 주면
  //   문자열로 저장된다. 반면 조회(`StockTrade.find({ portfolioId })`)는 스키마대로
  //   ObjectId 로 캐스팅되므로 **한 건도 안 맞는다.** 실제로 마감 sync 가 돌면서 교정해
  //   둔 148 건을 문자열로 덮었고, 블록별 매매 상세가 "매매 종목 주가 데이터가 없습니다"
  //   로 비었다.
  if (portfolioId !== undefined && portfolioId !== null) {
    update.$set.portfolioId =
      typeof portfolioId === "string" && Types.ObjectId.isValid(portfolioId)
        ? new Types.ObjectId(portfolioId)
        : portfolioId;
  }
  return {
    updateOne: {
      filter: { env: record.env, ticker: record.ticker, time },
      update,
      upsert: true,
    },
  };
}
