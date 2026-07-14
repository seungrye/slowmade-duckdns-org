import { describe, it, expect } from "vitest";
import { runInfiniteV4Backtest } from "./infinite-v4";
import type { Bar } from "./types";

const bar = (date: string, close: number, high = close, low = close): Bar => ({ date, open: close, high, low, close });

// splits=4, principal=4000 → 첫 매수 1000$. 별% = 15 − 7.5T.
const CFG = { principal: 4000, splits: 4 };

describe("무한매수 V4.0 (공식 원문) — 일반모드", () => {
  it("첫 매수는 새 사이클 '다음날' 전일종가+10% LOC 로 체결된다", () => {
    const r = runInfiniteV4Backtest([bar("d1", 100), bar("d2", 100)], CFG);
    expect(r.trades.filter((t) => t.date === "d1")).toHaveLength(0); // 첫날은 계획만
    expect(r.trades[0]).toMatchObject({ date: "d2", side: "buy", qty: 9, price: 100 }); // 수량=지정가(110) 기준
  });

  it("다음날 +10% 초과 급등이면 첫 매수 미체결 → 기준 갱신 후 재시도", () => {
    // d2 115 > 100×1.10 → 미체결. d3 115 ≤ 115×1.10(기준 갱신) → 체결.
    const r = runInfiniteV4Backtest([bar("d1", 100), bar("d2", 115), bar("d3", 115)], CFG);
    expect(r.trades.filter((t) => t.date === "d2")).toHaveLength(0);
    expect(r.trades[0].date).toBe("d3");
  });

  it("75% 지정가매도(+15%)만 체결되면 T×0.25 (원문 T 정의: ×0.25+매수)", () => {
    // d2 진입 @100(T=1, 별지점 107.5). d3 high 120·종가 105: 75% @115 체결(고가 터치),
    // 쿼터 LOC(105<107.5) 미체결 → 잔여 보유 + T=0.25. d4 하락 90 매수 → roundNo 가 1보다 작게 시작.
    const bars = [bar("d1", 100), bar("d2", 100), bar("d3", 105, 120), bar("d4", 90)];
    const r = runInfiniteV4Backtest(bars, CFG);
    const d3sell = r.trades.filter((t) => t.date === "d3" && t.side === "sell");
    expect(d3sell).toHaveLength(1);
    expect(d3sell[0].qty).toBe(7); // 9 − floor(9/4)=2 쿼터 제외한 75%
    const d4buy = r.trades.find((t) => t.date === "d4" && t.side === "buy");
    expect(d4buy).toBeDefined();
    expect(d4buy!.roundNo).toBeLessThan(1.5); // T=0.25 에서 매수 가산(×0.25 미반영이면 ≥2)
  });

  it("쿼터매도(별지점 LOC)만 체결되면 T×0.75", () => {
    // d3 종가 110 ≥ 별지점 107.5 → 쿼터 2주 종가 체결. 75%(+15%=115)는 high 110 미달 → 잔존.
    const bars = [bar("d1", 100), bar("d2", 100), bar("d3", 110), bar("d4", 90)];
    const r = runInfiniteV4Backtest(bars, CFG);
    const d3sell = r.trades.filter((t) => t.date === "d3" && t.side === "sell");
    expect(d3sell).toHaveLength(1);
    expect(d3sell[0].qty).toBe(2); // floor(10/4)
    const d4buy = r.trades.find((t) => t.date === "d4" && t.side === "buy");
    expect(d4buy!.roundNo).toBeLessThan(2); // T=0.75 기반(감축 없으면 1+매수분으로 2 근접)
  });

  it("급락일엔 LOC 사다리로 1회매수액을 종가에 전액 소진한다(원문 §4)", () => {
    // d3 종가 50(평단 100 아래): 별지점 레그(절반) + 평단 레그(남은 전부) 모두 종가에
    // 사다리로 채워짐 → 그날 매수 합계 = 1회액(1000$) 거의 전액. 종가가 낮을수록 수량↑.
    const bars = [bar("d1", 100), bar("d2", 100), bar("d3", 50)];
    const r = runInfiniteV4Backtest(bars, CFG);
    const d3buys = r.trades.filter((t) => t.date === "d3" && t.side === "buy");
    const spent = d3buys.reduce((s, t) => s + t.price * t.qty, 0);
    expect(d3buys.length).toBe(2); // 별지점 레그 + 평단 레그 둘 다 체결
    expect(spent).toBeGreaterThan(990); // one=3000/(4−1)=1000 전액 소진(사다리)
    expect(spent).toBeLessThanOrEqual(1000);
  });

  it("보통일(평단<종가≤별지점)엔 별지점 레그만 체결 → 절반만 소진", () => {
    // d3 종가 105(평단 100 위, 별지점 107.5 아래): 별지점 레그만 걸리고 평단 레그는 미체결.
    const bars = [bar("d1", 100), bar("d2", 100), bar("d3", 105)];
    const r = runInfiniteV4Backtest(bars, CFG);
    const d3buys = r.trades.filter((t) => t.date === "d3" && t.side === "buy");
    const spent = d3buys.reduce((s, t) => s + t.price * t.qty, 0);
    expect(d3buys.length).toBe(1); // 별지점 레그만
    expect(spent).toBeLessThanOrEqual(500); // 1회액의 절반(one/2=500) 이하
  });
});

describe("무한매수 V4.0 — 소진후 리버스모드", () => {
  it("T 소진 시 리버스 진입: 첫날 보유/(분할/2) 내림 MOC 매도, 매수 없음", () => {
    // 연속 급락으로 3일 매수(사다리 포함 매일 1회분 소진) → T=4 > 3 → 다음날 리버스 첫날.
    const bars = [bar("d1", 100), bar("d2", 100), bar("d3", 50), bar("d4", 30), bar("d5", 20), bar("d6", 20)];
    const r = runInfiniteV4Backtest(bars, CFG);
    const d6 = r.trades.filter((t) => t.date === "d6");
    expect(d6).toHaveLength(1); // 매도 1건만(매수 없음)
    expect(d6[0].side).toBe("sell");
    const heldBefore = r.trades.filter((t) => t.date < "d6")
      .reduce((s, t) => s + (t.side === "buy" ? t.qty : -t.qty), 0);
    expect(d6[0].qty).toBe(Math.floor(heldBefore / 2)); // divisor = splits/2 = 2
    expect(d6[0].qty).toBeLessThan(heldBefore); // 전량 아님
  });

  it("리버스 둘째날부터: 별지점(직전5일 평균) 아래면 잔금/4 쿼터매수", () => {
    const bars = [bar("d1", 100), bar("d2", 100), bar("d3", 50), bar("d4", 30), bar("d5", 20),
                  bar("d6", 20), bar("d7", 10)];
    const r = runInfiniteV4Backtest(bars, CFG);
    // d7: 별지점R = avg(100,50,30,20,20)=44 → 종가 10 < 44 → 쿼터매수 발생
    const d7buy = r.trades.find((t) => t.date === "d7" && t.side === "buy");
    expect(d7buy).toBeDefined();
  });
});
