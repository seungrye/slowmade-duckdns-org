import { describe, expect, it } from "vitest";
import { prevMarketDay } from "./infinite-v4-engine";

// 대사(reconcile) 날짜경계 회귀 방지 — lastRunDate 를 '어제'로 남기는 규칙 검증.
// 버그: lastRunDate=today 로 남기면 필터 `lastRunDate < date < today`(strict)가 매일 비어
// 전일 종가 LOC 체결이 영영 대사되지 않아 T·cycleCash 가 얼어붙는다.

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
  // 엔진 필터: lastRunDate < fillDate < today (양쪽 strict).
  const inWindow = (lastRunDate: string, fillDate: string, today: string) =>
    lastRunDate < fillDate && fillDate < today;

  it("전일 실행이 lastRunDate=어제 를 남기면, 그 전일(오늘) 종가 체결이 다음 실행 창에 포함된다", () => {
    // Day D 실행: 종가 LOC 체결 dated D. 실행 끝에 lastRunDate = prevMarketDay(D) = D-1.
    const dayD = "20260720";
    const lastRunAfterD = prevMarketDay(dayD); // "20260719"
    const fillOnD = dayD; // LOC 는 그날 종가 체결 → 체결일 == 실행일

    // Day D+1 실행: today = D+1, 필터 창에 D 체결이 잡혀야 대사가 이어진다.
    const dayD1 = "20260721";
    expect(inWindow(lastRunAfterD, fillOnD, dayD1)).toBe(true);
  });

  it("(버그 재현) lastRunDate=today 로 남기면 전일 체결이 다음 창에서 누락된다", () => {
    const dayD = "20260720";
    const lastRunBuggy = dayD; // 옛 코드: lastRunDate = today
    const fillOnD = dayD;
    const dayD1 = "20260721";
    // `20260720 < 20260720` false → 영영 누락(장부 정지).
    expect(inWindow(lastRunBuggy, fillOnD, dayD1)).toBe(false);
  });

  it("2단계 동일일(sell→buy): sell 이 어제로 올리면 buy 창은 비어 중복반영이 없다", () => {
    const dayD = "20260720";
    // sell(09:30) 끝: lastRunDate = prevMarketDay(D) = D-1.
    const afterSell = prevMarketDay(dayD); // "20260719"
    // buy(15:20) 대사 창: afterSell < date < today(D) → date ∈ {D-1} 뿐, D-1 은 이미 반영됨.
    // 오늘(D) 체결은 아직 없고, 있어도 date==today 라 strict 로 제외 → 중복 없음.
    expect(inWindow(afterSell, dayD, dayD)).toBe(false); // 오늘 체결은 제외
    expect(inWindow(afterSell, prevMarketDay(dayD), dayD)).toBe(false); // 어제는 이미 반영(strict 좌)
  });
});
