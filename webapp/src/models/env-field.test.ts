import { describe, expect, it } from "vitest";
import StockTrade from "./stock-trade";
import PortfolioHistory from "./portfolio-history";
import TradingAccount from "./trading-account";

// #515 — stocktrades.env · portfoliohistories.env 의 enum 은 ["paper","real"] 인데
// **실제로 들어가는 값은 계정 envKey**(`paper-50194613`)다. close-sync 가
// `env: account.envKey` 로 쓰고, upsert 는 mongoose validator 를 안 돌려서 지금까지
// 안 터졌을 뿐이다 — 실측(2026-09-30) distinct 결과가 ["paper-50194613"] 하나였다.
//
// 거짓 enum 은 언젠가 터진다: save() 경로가 하나라도 생기거나 runValidators 를 켜면
// 그 순간 전 계정의 매매기록 기록이 막힌다. 스키마를 실제에 맞춘다.

const trade = (env: string) => new StockTrade({
  env, ticker: "TQQQ", action: "buy", qty: 1, price: 10,
  date: "2026-09-30", time: "2026-09-30T13:35:35.855000Z",
});

const history = (env: string) => new PortfolioHistory({
  env, currency: "USD", date: new Date("2026-09-30T20:10:00Z"), dateStr: "2026-09-30",
});

describe("env 필드는 계정 envKey 를 받는다 (#515)", () => {
  it("매매기록이 envKey 를 거부하지 않는다 — 실제로 저장되는 값이다", () => {
    expect(trade("paper-50194613").validateSync()?.errors?.env).toBeUndefined();
  });

  it("포트폴리오 이력도 마찬가지", () => {
    expect(history("paper-50194613").validateSync()?.errors?.env).toBeUndefined();
  });

  it("옛 단일계정 값도 그대로 통한다 — 과거 기록을 막으면 안 된다", () => {
    expect(trade("paper").validateSync()?.errors?.env).toBeUndefined();
    expect(trade("real").validateSync()?.errors?.env).toBeUndefined();
  });

  it("env 는 여전히 필수다 — 아무거나 받자는 게 아니다", () => {
    expect(trade("").validateSync()?.errors?.env).toBeDefined();
    expect(history("").validateSync()?.errors?.env).toBeDefined();
  });
});

describe("계정의 env 는 진짜 enum 이다 — 여긴 그대로 둔다", () => {
  it("paper|real|toss 만 받는다", () => {
    const acct = (env: string) => new TradingAccount({
      ownerEmail: "me@test.com", broker: "kis", env, name: "1", envKey: `${env}-1`,
    });
    expect(acct("paper").validateSync()?.errors?.env).toBeUndefined();
    expect(acct("toss").validateSync()?.errors?.env).toBeUndefined();
    expect(acct("paper-50194613").validateSync()?.errors?.env).toBeDefined();
  });
});
