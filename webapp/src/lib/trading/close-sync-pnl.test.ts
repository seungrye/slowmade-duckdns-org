import { describe, expect, it } from "vitest";
import { walkLedger, type LedgerRow } from "./close-sync";

// #500 — 누적 실현손익이 "누적" 이 아니라 "최근 90일 창 재계산" 이었다.
// 창 밖으로 밀려난 매수는 원가를 잃고, 그 물량을 팔면 매도대금 전액이 이익으로 잡혔다.
// 실측: USD DB +86,384 / 참값 −2,238 (오차 +88,623), KRW 335,993 / 244,996 (+90,997).
//
// 여기서 보는 것은 원장 워크의 **불변식**이다. "어느 구간을 잘라 넣었느냐" 가 결과를
// 바꾸면 안 된다는 것이 핵심이고, 그게 3개월 동안 안 드러난 이유이기도 하다.

const row = (o: Partial<LedgerRow> & { date: string; side: "buy" | "sell"; qty: number; price: number }): LedgerRow => ({
  ticker: "TQQQ", time: `${o.date}T10:00:00`, currency: "USD", ...o,
});

const TODAY = "2026-09-29";

describe("walkLedger — 구간을 잘라도 누적이 변하지 않는다", () => {
  // 6월에 사고 9월에 판 물량. 90일 창이 밀리면 6월 매수가 빠진다.
  const full: LedgerRow[] = [
    row({ date: "2026-06-25", side: "buy", qty: 10, price: 100 }),
    row({ date: "2026-09-29", side: "sell", qty: 10, price: 110 }),
  ];

  it("전체 원장을 주면 차익만 이익이다", () => {
    const w = walkLedger(full, TODAY);
    expect(w.cum).toBeCloseTo(100); // (110−100)×10
    expect(w.run).toBeCloseTo(100);
    expect(w.unknownCost).toEqual([]);
  });

  it("매수가 빠진 구간만 주면 — 예전 버그 — 매도대금 전액이 이익이 되지 않는다", () => {
    // 이게 운영에서 일어난 일이다. 이제는 원가 미상으로 **손익에서 제외**한다.
    const w = walkLedger(full.slice(1), TODAY);
    expect(w.cum).toBe(0);                 // 예전엔 1,100(=110×10)
    expect(w.unknownCost).toHaveLength(1); // 조용히 넘기지 않는다
    expect(w.unknownCost[0]).toContain("TQQQ");
  });

  it("원가를 모르는 매도는 0 으로 채우지 않는다 — 모른다고 표시한다", () => {
    const w = walkLedger([row({ date: TODAY, side: "sell", qty: 5, price: 50 })], TODAY);
    expect(w.cum).toBe(0);
    expect(w.run).toBe(0);
    expect(w.unknownCost).toHaveLength(1);
  });
});

describe("walkLedger — 평균단가 회계", () => {
  it("여러 번 매수한 뒤 일부 매도 → 가중평균으로 손익", () => {
    const w = walkLedger([
      row({ date: "2026-09-01", side: "buy", qty: 10, price: 100 }),
      row({ date: "2026-09-02", side: "buy", qty: 10, price: 120 }),
      row({ date: TODAY, side: "sell", qty: 5, price: 130 }),
    ], TODAY);
    expect(w.cum).toBeCloseTo((130 - 110) * 5); // 평단 110
    expect(w.run).toBeCloseTo(100);
  });

  it("run 은 오늘 매도만 — 어제 매도는 cum 에만", () => {
    const w = walkLedger([
      row({ date: "2026-09-01", side: "buy", qty: 10, price: 100 }),
      row({ date: "2026-09-28", side: "sell", qty: 5, price: 110 }),
      row({ date: TODAY, side: "sell", qty: 5, price: 120 }),
    ], TODAY);
    expect(w.cum).toBeCloseTo(50 + 100);
    expect(w.run).toBeCloseTo(100);
  });

  it("전량 매도 후 재진입 → 원가가 새로 쌓인다", () => {
    const w = walkLedger([
      row({ date: "2026-09-01", side: "buy", qty: 10, price: 100 }),
      row({ date: "2026-09-02", side: "sell", qty: 10, price: 110 }),
      row({ date: "2026-09-03", side: "buy", qty: 10, price: 200 }),
      row({ date: TODAY, side: "sell", qty: 10, price: 210 }),
    ], TODAY);
    expect(w.cum).toBeCloseTo(100 + 100);
    expect(w.unknownCost).toEqual([]);
  });

  it("보유보다 많이 팔면 보유분만 손익 — 초과분은 원가 미상", () => {
    const w = walkLedger([
      row({ date: "2026-09-01", side: "buy", qty: 5, price: 100 }),
      row({ date: TODAY, side: "sell", qty: 8, price: 110 }),
    ], TODAY);
    expect(w.cum).toBeCloseTo((110 - 100) * 5); // 초과 3주는 제외
    expect(w.unknownCost).toHaveLength(1);
  });

  it("종목이 섞여도 각자 원장을 쓴다", () => {
    const w = walkLedger([
      row({ ticker: "A", date: "2026-09-01", side: "buy", qty: 10, price: 100 }),
      row({ ticker: "B", date: "2026-09-01", side: "buy", qty: 10, price: 200 }),
      row({ ticker: "A", date: TODAY, side: "sell", qty: 10, price: 110 }),
    ], TODAY);
    expect(w.cum).toBeCloseTo(100);
    expect(w.unknownCost).toEqual([]);
  });
});

describe("walkLedger — 누적수량", () => {
  it("행마다 그 직후 보유수량을 준다(전체 원장 기준)", () => {
    const rows: LedgerRow[] = [
      row({ date: "2026-09-01", side: "buy", qty: 10, price: 100 }),
      row({ date: "2026-09-02", side: "buy", qty: 5, price: 110 }),
      row({ date: TODAY, side: "sell", qty: 6, price: 120 }),
    ];
    const w = walkLedger(rows, TODAY);
    expect(w.cumQty.get(`TQQQ|${rows[0].time}|buy`)).toBe(10);
    expect(w.cumQty.get(`TQQQ|${rows[1].time}|buy`)).toBe(15);
    expect(w.cumQty.get(`TQQQ|${rows[2].time}|sell`)).toBe(9);
  });

  it("구간만 주면 누적수량이 낮게 나온다 — 그래서 전체 원장을 먹여야 한다", () => {
    // 실측: 069500 저장 21 / 실제 24, 오차 −3 = 창 밖 매수분
    const rows: LedgerRow[] = [
      row({ date: "2026-06-29", side: "buy", qty: 3, price: 100 }),
      row({ date: TODAY, side: "sell", qty: 1, price: 120 }),
    ];
    expect(walkLedger(rows, TODAY).cumQty.get(`TQQQ|${rows[1].time}|sell`)).toBe(2);
    expect(walkLedger(rows.slice(1), TODAY).cumQty.get(`TQQQ|${rows[1].time}|sell`)).toBe(0);
  });
});

describe("walkLedger — 결정적이다", () => {
  it("입력 순서가 뒤바뀌어도 같은 결과", () => {
    const rows: LedgerRow[] = [
      row({ date: "2026-09-01", side: "buy", qty: 10, price: 100 }),
      row({ date: "2026-09-02", side: "buy", qty: 10, price: 120 }),
      row({ date: TODAY, side: "sell", qty: 5, price: 130 }),
    ];
    const a = walkLedger(rows, TODAY);
    const b = walkLedger([...rows].reverse(), TODAY);
    expect(b.cum).toBeCloseTo(a.cum);
    expect(b.run).toBeCloseTo(a.run);
  });

  it("같은 초의 매수·매도도 입력 순서에 좌우되지 않는다", () => {
    // 같은 초 안의 실제 순서는 알 수 없다 — 알 수 없다는 사실을 결정적으로 처리한다.
    const t = `${TODAY}T15:20:00`;
    const mk = (): LedgerRow[] => [
      { ticker: "X", date: TODAY, time: t, side: "sell", qty: 5, price: 130, currency: "USD" },
      { ticker: "X", date: TODAY, time: t, side: "buy", qty: 5, price: 100, currency: "USD" },
    ];
    const a = walkLedger(mk(), TODAY);
    const b = walkLedger(mk().reverse(), TODAY);
    expect(b.cum).toBeCloseTo(a.cum);
    expect(b.unknownCost.length).toBe(a.unknownCost.length);
  });

  it("빈 원장은 0 · 미상 없음", () => {
    expect(walkLedger([], TODAY)).toMatchObject({ run: 0, cum: 0, unknownCost: [] });
  });
});
