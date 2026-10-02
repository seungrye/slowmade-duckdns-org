import { describe, expect, it } from "vitest";
import { cumAsOf, mergeFills, reconcileBooks, walkBooks, type BookRow } from "./pnl-walk";

// #505 — 블록별 누적손익. 정의는 **가장 단순한 것**이다: 그 블록에 귀속된 체결만으로 돌린
// 평균단가 워크. pro-rata 배분은 기각됐다(한 주도 안 판 블록에 실현손익이 찍힌다).
//
// 대신 이 정의는 **귀속이 정확할 때만** 닫힌다. 그래서 여기서 못박는 것은 두 가지다:
//   ① 귀속이 어긋나면 잔차가 생기고 **원인이 이름과 함께 나온다**(조용히 0 이 아니다)
//   ② 귀속이 맞으면 Σbook + 무주 == 계좌 전체

const row = (o: Partial<BookRow> & {
  book: string; date: string; side: "buy" | "sell"; qty: number; price: number;
}): BookRow => ({ ticker: "TQQQ", time: `${o.date}T22:35:00`, currency: "USD", ...o });

const TODAY = "2026-09-30";

describe("walkBooks — book 별로 따로 걷는다", () => {
  it("book 마다 자기 원장의 실현손익만 낸다", () => {
    const { books } = walkBooks([
      row({ book: "A", date: "2026-09-01", side: "buy", qty: 10, price: 100 }),
      row({ book: "A", date: TODAY, side: "sell", qty: 10, price: 110 }),
      row({ book: "B", ticker: "SOXL", date: "2026-09-01", side: "buy", qty: 5, price: 20 }),
      row({ book: "B", ticker: "SOXL", date: TODAY, side: "sell", qty: 5, price: 30 }),
    ], TODAY);
    expect(books.A.cum).toBeCloseTo(100);
    expect(books.B.cum).toBeCloseTo(50);
    expect(books.A.run).toBeCloseTo(100);
  });

  it("무주는 빈 문자열 book 으로 정식 취급한다 — 버리지 않는다", () => {
    const { books } = walkBooks([
      row({ book: "", date: "2026-09-01", side: "buy", qty: 4, price: 76.475 }),
      row({ book: "", date: TODAY, side: "sell", qty: 4, price: 65.96 }),
    ], TODAY);
    expect(books[""].cum).toBeCloseTo(-42.06, 1);
  });

  it("book 이 없으면 빈 객체 — 던지지 않는다", () => {
    expect(walkBooks([], TODAY).books).toEqual({});
  });
});

describe("reconcileBooks — 분해가 닫히는지 스스로 검사한다", () => {
  // 07-17 straddle 회귀 케이스. 실제로 있었던 일이다:
  //   무주 매수 06-23 2@77.37 · 06-24 1@75.55 · 1@75.61  (평균 76.475)
  //   블록 귀속 매도 07-17 4@65.96
  // 매수는 무주, 매도는 블록 → 손익 (65.96−76.475)×4 = −42.06 이 갈려 사라졌다.
  const straddle: BookRow[] = [
    row({ book: "", date: "2026-06-23", time: "2026-06-23T22:35:00", side: "buy", qty: 2, price: 77.37 }),
    row({ book: "", date: "2026-06-24", time: "2026-06-24T22:35:00", side: "buy", qty: 1, price: 75.55 }),
    row({ book: "", date: "2026-06-24", time: "2026-06-24T22:35:01", side: "buy", qty: 1, price: 75.61 }),
    row({ book: "v4", date: "2026-07-17", time: "2026-07-17T22:35:16", side: "sell", qty: 4, price: 65.96 }),
  ];

  it("귀속이 어긋나면 잔차가 42.06 이고 **원인이 함께 나온다**", () => {
    // 무주 원장은 매수만(cum 0), 블록 원장은 원가미상 매도(cum 0) → Σbook 0.
    // 계좌 전체는 (65.96−76.475)×4 = −42.06 을 실현한다. residual = Σbook − pooled = +42.06.
    const { books, pooled } = walkBooks(straddle, TODAY);
    const rec = reconcileBooks(books, pooled);
    expect(rec.residual).toBeCloseTo(42.06, 1);
    expect(pooled.cum).toBeCloseTo(-42.06, 1);
    // 잔차만 있고 원인이 없으면 3개월 또 숨는다 — 그래서 비어 있을 수 없다.
    expect(rec.reasons.length).toBeGreaterThan(0);
    expect(rec.reasons.join(" ")).toContain("TQQQ");
  });

  it("귀속을 고치면(매도도 무주로) 잔차가 0 이고 원가미상이 사라진다", () => {
    const fixed = straddle.map((r) => ({ ...r, book: "" }));
    const { books, pooled } = walkBooks(fixed, TODAY);
    const rec = reconcileBooks(books, pooled);
    expect(rec.residual).toBeCloseTo(0, 6);
    expect(rec.reasons).toEqual([]);
    expect(books[""].unknownCost).toEqual([]);
  });

  it("정상 분해는 잔차 0 — 그래도 호출측이 '0 도 찍는다'", () => {
    const { books, pooled } = walkBooks([
      row({ book: "A", date: "2026-09-01", side: "buy", qty: 10, price: 100 }),
      row({ book: "A", date: TODAY, side: "sell", qty: 10, price: 110 }),
      row({ book: "", ticker: "X", date: "2026-09-01", side: "buy", qty: 1, price: 50 }),
      row({ book: "", ticker: "X", date: TODAY, side: "sell", qty: 1, price: 40 }),
    ], TODAY);
    expect(reconcileBooks(books, pooled).residual).toBeCloseTo(0, 6);
  });

  it("같은 종목을 두 book 이 동시에 들면 원가미상 없이도 잔차가 난다 — 그것도 원인으로 지목한다", () => {
    // 평단 pooling 차이. 「원가미상」만 원인으로 적으면 이 경우를 설명 못 한다.
    const { books, pooled } = walkBooks([
      row({ book: "A", date: "2026-09-01", side: "buy", qty: 100, price: 10 }),
      row({ book: "B", date: "2026-09-02", side: "buy", qty: 100, price: 20 }),
      row({ book: "A", date: TODAY, side: "sell", qty: 100, price: 30 }),
    ], TODAY);
    const rec = reconcileBooks(books, pooled);
    expect(rec.residual).not.toBeCloseTo(0, 2);
    expect(rec.reasons.join(" ")).toMatch(/동시|겹/);
  });
});

describe("cumAsOf — 매매 없는 날은 직전 값을 잇는다", () => {
  const byDate = new Map([["2026-09-01", 100], ["2026-09-10", 250]]);
  it("그 날짜 이하의 마지막 값", () => {
    expect(cumAsOf(byDate, "2026-09-05")).toBe(100);
    expect(cumAsOf(byDate, "2026-09-10")).toBe(250);
    expect(cumAsOf(byDate, "2026-09-30")).toBe(250);
  });
  it("첫 매매 전은 0 — 손익이 없었던 것이 맞다", () => {
    expect(cumAsOf(byDate, "2026-08-31")).toBe(0);
  });
});

describe("walkBooks — #500 에서 상속한 계약", () => {
  it("구간을 앞에서 자르면 값이 달라진다 — 전체 원장을 먹여야 뜻이 있다", () => {
    const full: BookRow[] = [
      row({ book: "A", date: "2026-06-25", side: "buy", qty: 10, price: 100 }),
      row({ book: "A", date: TODAY, side: "sell", qty: 10, price: 110 }),
    ];
    expect(walkBooks(full, TODAY).books.A.cum).toBeCloseTo(100);
    // 매수가 빠지면 원가 미상으로 **제외**한다(0 으로 채우지 않는다)
    const cut = walkBooks(full.slice(1), TODAY).books.A;
    expect(cut.cum).toBe(0);
    expect(cut.unknownCost).toHaveLength(1);
  });
});

// #527 ② — close-sync 의 fills dedup 이 `ticker|time|side` 로 **fills 끼리도** 적용돼
// 같은 초 형제 체결을 버렸다. 그런데 같은 파일의 `agg` 는 같은 키를 **합산**한다 —
// 같은 키에 규칙이 둘이었다.
//
// ord_tmd 는 초 단위라 **한 주문의 부분체결은 전부 같은 값**을 갖는다. paper 는 1주로
// 끝났지만(⚠ 원장 수량 불일치 TQQQ: 원장 32 vs 보유 33, 2026-10-01 실측), real 에서
// 30주가 10+20 으로 갈리면 20주의 원가가 사라진다.
describe("mergeFills — 같은 초 형제 체결을 합산한다 (#527)", () => {
  const f = (qty: number, price: number, time = "2026-10-01T22:36:02") =>
    ({ ticker: "TQQQ", date: "2026-10-01", time, side: "buy" as const, qty, price, currency: "USD" });

  it("같은 키면 수량을 더하고 가격은 가중평균한다 — 버리지 않는다", () => {
    const [r] = mergeFills([f(10, 100), f(20, 70)]);
    expect(r.qty).toBe(30);
    expect(r.price).toBeCloseTo((10 * 100 + 20 * 70) / 30, 6); // 80
  });

  it("운영 실측 그대로 — 같은 초 1+1 이 2 가 된다", () => {
    const rows = mergeFills([f(30, 78, "2026-10-01T22:36:00"), f(1, 78, "2026-10-01T22:36:01"),
                             f(1, 78), f(1, 78)]);
    expect(rows).toHaveLength(3);
    expect(rows.find((x) => x.time === "2026-10-01T22:36:02")!.qty).toBe(2);
    expect(rows.reduce((a, x) => a + x.qty, 0)).toBe(33); // 32 가 아니다
  });

  it("매수와 매도는 따로 센다 — 같은 초여도 다른 건이다", () => {
    const rows = mergeFills([f(5, 100), { ...f(5, 100), side: "sell" as const }]);
    expect(rows).toHaveLength(2);
  });

  it("종목이 다르면 따로", () => {
    expect(mergeFills([f(1, 1), { ...f(1, 1), ticker: "SOXL" }])).toHaveLength(2);
  });

  it("빈 입력은 빈 배열", () => {
    expect(mergeFills([])).toEqual([]);
  });

  it("입력을 건드리지 않는다", () => {
    const xs = [f(10, 100), f(20, 70)];
    const snap = JSON.stringify(xs);
    mergeFills(xs);
    expect(JSON.stringify(xs)).toBe(snap);
  });
});
