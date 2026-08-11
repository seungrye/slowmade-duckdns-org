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
  const { strategy, ...rest } = record;
  const time = normalizeTradeTime(String(record.time));
  const update: { $set: Json; $setOnInsert?: Json } = { $set: { ...rest, time } };
  // 전략을 모르는 레코드에 빈 값을 박아 두지 않는다 — 나중에 채울 여지를 남긴다.
  if (strategy !== undefined && strategy !== null && strategy !== "") {
    update.$setOnInsert = { strategy };
  }
  return {
    updateOne: {
      filter: { env: record.env, ticker: record.ticker, time },
      update,
      upsert: true,
    },
  };
}
