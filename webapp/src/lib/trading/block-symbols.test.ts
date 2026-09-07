import { describe, it, expect } from "vitest";
import { blockSymbols } from "./block-symbols";

describe("blockSymbols", () => {
  it("단일 종목 전략은 config.symbol", () => {
    expect(blockSymbols({ symbol: "TQQQ", principal: 93300 })).toEqual(["TQQQ"]);
  });

  it("lrs 는 config.target", () => {
    expect(blockSymbols({ target: "SOXL", signal: "QQQ" })).toEqual(["SOXL"]);
  });

  it("trend 는 config.universe — 문자열이 아닌 항목은 버린다", () => {
    expect(blockSymbols({ universe: ["AAPL", 1, "MSFT", null] })).toEqual(["AAPL", "MSFT"]);
  });

  it("종목을 알 수 없으면 null — 빈 배열이 아니다", () => {
    // rotation auto-selects its candidates. Returning [] would be a lie meaning "it handles nothing".
    expect(blockSymbols({ candidates: [] })).toBeNull();
    expect(blockSymbols({})).toBeNull();
  });

  it("symbol 이 target·universe 보다 우선", () => {
    expect(blockSymbols({ symbol: "TQQQ", target: "SOXL", universe: ["AAPL"] })).toEqual(["TQQQ"]);
  });
});
