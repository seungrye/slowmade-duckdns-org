import { describe, expect, it } from "vitest";
import { prevMarketDay } from "./infinite-v4-engine";

// Guards the reconciliation date-boundary regression - the rule that lastRunDate is left at 'yesterday'.
// The bug: leaving lastRunDate at today empties the filter `lastRunDate < date < today` (strict) every day,
// so a previous close's LOC fill is never reconciled and T and cycleCash freeze.

describe("infinite-v4-engine.prevMarketDay", () => {
  it("하루 전(같은 달)", () => {
    expect(prevMarketDay("20260720")).toBe("20260719");
  });
  it("월 경계", () => {
    expect(prevMarketDay("20260701")).toBe("20260630");
  });
  it("연 경계", () => {
    expect(prevMarketDay("20260101")).toBe("20251231");
  });
  it("윤년 2월", () => {
    expect(prevMarketDay("20240301")).toBe("20240229");
  });
});

describe("infinite-v4-engine 대사 윈도우 경계 불변식", () => {
  // The engine's filter: lastRunDate < fillDate < today (strict on both sides).
  const inWindow = (lastRunDate: string, fillDate: string, today: string) =>
    lastRunDate < fillDate && fillDate < today;

  it("전일 실행이 lastRunDate=어제 를 남기면, 그 전일(오늘) 종가 체결이 다음 실행 창에 포함된다", () => {
    // Day D's run: a closing LOC fill dated D. The run ends with lastRunDate = prevMarketDay(D) = D-1.
    const dayD = "20260720";
    const lastRunAfterD = prevMarketDay(dayD); // "20260719"
    const fillOnD = dayD; // A LOC fills at that day's close, so the fill date equals the run date

    // Day D+1's run: today = D+1, and D's fill must fall in the filter window for reconciliation to continue.
    const dayD1 = "20260721";
    expect(inWindow(lastRunAfterD, fillOnD, dayD1)).toBe(true);
  });

  it("(버그 재현) lastRunDate=today 로 남기면 전일 체결이 다음 창에서 누락된다", () => {
    const dayD = "20260720";
    const lastRunBuggy = dayD; // The old code: lastRunDate = today
    const fillOnD = dayD;
    const dayD1 = "20260721";
    // `20260720 < 20260720` is false -> dropped forever (a frozen ledger).
    expect(inWindow(lastRunBuggy, fillOnD, dayD1)).toBe(false);
  });

  it("2단계 동일일(sell→buy): sell 이 어제로 올리면 buy 창은 비어 중복반영이 없다", () => {
    const dayD = "20260720";
    // End of sell (09:30): lastRunDate = prevMarketDay(D) = D-1.
    const afterSell = prevMarketDay(dayD); // "20260719"
    // The buy (15:20) window: afterSell < date < today(D), so date is only {D-1}, already applied.
    // Today's (D) fills do not exist yet, and even then date == today is excluded by strictness -> no double counting.
    expect(inWindow(afterSell, dayD, dayD)).toBe(false); // today's fills are excluded
    expect(inWindow(afterSell, prevMarketDay(dayD), dayD)).toBe(false); // yesterday is already applied (strict on the left)
  });
});
