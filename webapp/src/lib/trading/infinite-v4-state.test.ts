import { describe, expect, it } from "vitest";
import {
  absorbIdleCash, emptyPending, mergeDegradedPending, mergePending, newV4State, reconcileDay,
  recordPending,
  type V4Pending, type V4State,
} from "./infinite-v4-state";
import { cyclesFor } from "./scheduler";

// 파이썬 tests/test_infinite_v4_state.py 와 동일 벡터 — 포팅 일치 확인.

function st(over: Partial<V4State> = {}): V4State {
  return { ...newV4State("TQQQ", 20, 10_000), t: 5, ...over };
}

// 흡수 상한 = max(principal, cycleCash). 아래 st() 는 원금 10,000 로 만들어지므로
// 상한을 넘겨 보려면 principal 을 명시해서 부른다.
describe("infinite-v4-state.absorbIdleCash — 유휴현금(입금) 흡수", () => {
  it("플랫(holding 0) + 계좌현금 > cycleCash → cycleCash 재시드(입금 흡수)", () => {
    const s = st({ cycleCash: 3900 });
    const out = absorbIdleCash(s, 4900, 0, true, 10_000); // $1000 입금(원금 이내)
    expect(out.cycleCash).toBe(4900);
    expect(s.cycleCash).toBe(3900); // 원본 불변
  });
  it("보유 중(holding>0)이면 흡수 안 함(진행 사이클 보호)", () => {
    const out = absorbIdleCash(st({ cycleCash: 3900 }), 4900, 10, true, 10_000);
    expect(out.cycleCash).toBe(3900);
  });
  it("계좌현금이 cycleCash 이하면 무변경(미정산 감소 무시)", () => {
    const out = absorbIdleCash(st({ cycleCash: 3900 }), 3000, 0, true, 10_000);
    expect(out.cycleCash).toBe(3900);
  });
  it("enabled=false 면 무변경", () => {
    const out = absorbIdleCash(st({ cycleCash: 3900 }), 9999, 0, false, 10_000);
    expect(out.cycleCash).toBe(3900);
  });

  // #485 — 상한이 없으면 사이클 경계에서 계좌 현금 전액이 원금이 됐다.
  it("계좌에 원금보다 많은 돈이 있어도 원금까지만 흡수한다", () => {
    const out = absorbIdleCash(st({ cycleCash: 3900 }), 50_000, 0, true, 10_000);
    expect(out.cycleCash).toBe(10_000); // 계좌 5만이어도 원금 1만까지
  });
  it("복리로 장부가 원금을 넘었으면 장부가 상한 — 계좌에 더 있어도 무변경", () => {
    const out = absorbIdleCash(st({ cycleCash: 12_000 }), 50_000, 0, true, 10_000);
    expect(out.cycleCash).toBe(12_000); // 제 힘으로 불린 몫은 지키고, 남의 돈은 안 집는다
  });
  it("계좌현금이 원금보다 적으면 계좌현금까지만(없는 돈을 있다고 하지 않는다)", () => {
    const out = absorbIdleCash(st({ cycleCash: 3900 }), 6000, 0, true, 10_000);
    expect(out.cycleCash).toBe(6000);
  });
});

// #483 — 국장 v4 는 하루가 sell(09:30)/buy(15:20) 두 사이클이라, phase 마다 pending 을
// 새로 만들어 통째로 저장하면 나중에 도는 buy 가 sell 의 q75 를 0 으로 덮었다.
describe("infinite-v4-state.mergePending — phase 로 나뉜 하루의 예약 합치기", () => {
  const prev = { ...emptyPending(), one: 500, q75: 24, reverseFirst: true };
  const next = { ...emptyPending(), one: 500, q25: 8, reverseSell: 3 };

  it("buy phase 는 앞 phase 의 q75·reverseFirst 를 이어받는다", () => {
    const out = mergePending(prev, next, "buy");
    expect(out.q75).toBe(24);
    expect(out.reverseFirst).toBe(true);
    expect(out.q25).toBe(8); // 자기가 만든 칸은 그대로
    expect(out.reverseSell).toBe(3);
  });
  it("sell phase 는 하루의 시작이라 이어받지 않는다", () => {
    const out = mergePending(prev, { ...emptyPending(), q75: 24 }, "sell");
    expect(out).toEqual({ ...emptyPending(), q75: 24 });
  });
  it("both(미장)는 한 사이클에서 다 적으므로 그대로", () => {
    const full = { ...emptyPending(), one: 9, q25: 2, q75: 6 };
    expect(mergePending(prev, full, "both")).toEqual(full);
  });
  it("원본 불변(순수)", () => {
    mergePending(prev, next, "buy");
    expect(next.q75).toBe(0);
    expect(prev.q25).toBe(0);
  });
});

describe("infinite-v4-state.reconcileDay — 파이썬 벡터", () => {
  it("¾ 지정가(q75) 체결 → T×0.25, 잔여 보유 → 사이클 유지", () => {
    const s = st({ pendingByDate: { D: { ...emptyPending(), one: 500, q25: 2, q75: 6 } } });
    const s2 = reconcileDay(s, [{ side: "sell", qty: 6, price: 115 }], 2, "D");
    expect(s2.t).toBeCloseTo(1.25);
    expect(s2.cycleCash).toBe(10_000 + 6 * 115);
  });

  // #483 이 왜 위험한지 못박아 두는 특성 테스트 — 대사는 "수량" 으로 매도 종류를 가리므로
  // q75 예약이 0 이면 ¾ 체결(6주)이 q25 조건(6 >= 2)에 먼저 걸려 ×0.75 가 된다.
  // 정답은 위 테스트의 1.25 다. mergePending 이 q75 를 살려야 이 경로로 안 빠진다.
  it("q75 예약이 지워지면 ¾ 체결이 q25 분기로 잘못 빠진다(수량만으로는 못 가린다)", () => {
    const s = st({ pendingByDate: { D: { ...emptyPending(), one: 500, q25: 2, q75: 0 } } });
    const s2 = reconcileDay(s, [{ side: "sell", qty: 6, price: 115 }], 2, "D");
    expect(s2.t).toBeCloseTo(3.75); // 1.25 여야 할 자리 — 예약을 잃으면 이렇게 된다
  });

  it("쿼터(q25) 체결 → T×0.75", () => {
    const s = st({ pendingByDate: { D: { ...emptyPending(), one: 500, q25: 2, q75: 6 } } });
    const s2 = reconcileDay(s, [{ side: "sell", qty: 2, price: 108 }], 6, "D");
    expect(s2.t).toBeCloseTo(3.75);
  });

  it("전량 소진 → 리셋(복리 — 매도대금 반영)", () => {
    const s = st({ pendingByDate: { D: { ...emptyPending(), one: 500, q25: 2, q75: 6 } } });
    const s2 = reconcileDay(s, [
      { side: "sell", qty: 6, price: 115 }, { side: "sell", qty: 2, price: 112 },
    ], 0, "D");
    expect(s2.t).toBe(0);
    expect(s2.mode).toBe("normal");
    expect(s2.cycleCash).toBe(10_000 + 6 * 115 + 2 * 112);
  });

  it("매수 체결 250(=one 절반) → T += 0.5", () => {
    const s = st({ pendingByDate: { D: { ...emptyPending(), one: 500 } } });
    const s2 = reconcileDay(s, [{ side: "buy", qty: 5, price: 50 }], 10, "D");
    expect(s2.t).toBeCloseTo(5.5);
    expect(s2.cycleCash).toBe(10_000 - 250);
  });

  it("진입 체결 → T=1, entryLimit 해제", () => {
    const s = st({ t: 0, entryLimit: 110 });
    const s2 = reconcileDay(s, [{ side: "buy", qty: 9, price: 100 }], 9, "D");
    expect(s2.t).toBe(1);
    expect(s2.entryLimit).toBe(0);
  });

  it("T 소진(>splits−1) → 리버스 예약(첫날 플래그)", () => {
    const s = st({ t: 18.8, pendingByDate: { D: { ...emptyPending(), one: 500 } } });
    const s2 = reconcileDay(s, [{ side: "buy", qty: 4, price: 50 }], 100, "D");
    expect(s2.t).toBeGreaterThan(19);
    expect(s2.mode).toBe("reverse");
    expect(s2.reverseFirstDay).toBe(true);
  });

  it("리버스: 매도 → T×0.9(20분할), 매수 → T += (분할−T)×0.25", () => {
    const s = st({ mode: "reverse", t: 19.5, pendingByDate: { D: { ...emptyPending(), reverseSell: 10 } } });
    const s2 = reconcileDay(s, [{ side: "sell", qty: 10, price: 50 }], 90, "D");
    expect(s2.t).toBeCloseTo(19.5 * 0.9);
    const s3 = reconcileDay(s2, [{ side: "buy", qty: 5, price: 40 }], 95, "D");
    expect(s3.t).toBeCloseTo(s2.t + (20 - s2.t) * 0.25);
  });

  it("원본 불변(순수)", () => {
    const s = st({ pendingByDate: { D: { ...emptyPending(), one: 500, q75: 6 } } });
    reconcileDay(s, [{ side: "sell", qty: 6, price: 115 }], 2, "D");
    expect(s.t).toBe(5);
    expect(s.cycleCash).toBe(10_000);
  });
});

describe("scheduler.cyclesFor — 매매 phase + 마감 sync 사이클", () => {
  const close = { phase: "close", at: "16:10" }; // 모든 포트폴리오 공통(체결확인·차트·메일)
  it("국장 v4 = 매도(runAt) + 매수(15:20) + 마감", () => {
    expect(cyclesFor({ strategy: "infinite_v4", market: "kr", runAt: "09:30" })).toEqual([
      { phase: "sell", at: "09:30" }, { phase: "buy", at: "15:20" }, close,
    ]);
  });
  it("미장 v4 = both(실제 LOC) + 마감", () => {
    expect(cyclesFor({ strategy: "infinite_v4", market: "us", runAt: "09:35" })).toEqual([
      { phase: "both", at: "09:35" }, close,
    ]);
  });
  it("그 외 전략 = main + 마감", () => {
    expect(cyclesFor({ strategy: "lrs_v1", market: "us", runAt: "09:35" })).toEqual([
      { phase: "main", at: "09:35" }, close,
    ]);
  });
});

// #521 ① — degraded(대사 실패) 때 예약을 통째로 안 저장한 것은 **너무 넓었다**(#519 회귀).
// degraded 사이클도 q75(¾ 익절)는 실제로 내보낸다. 그런데 예약에 안 남으니, 같은 날 buy
// 사이클이 `mergePending(..., "buy")` 로 prev.q75=0 을 승계하고 다음 날 ¾ 체결이 q25 분기로
// 읽혀 **T 를 ×0.25 대신 ×0.75** 한다.
//
// 슬롯마다 요구가 다르다:
//   one            전일 값 보존 — 낡은 cycleCash 로 다시 계산하면 안 된다(T 증분 분모)
//   q75·reverseFirst  당일 발주값으로 갱신 — 실제로 내보냈다
//   q25·reverseSell   당일 발주 없음 → 0
describe("mergeDegradedPending — degraded 때 슬롯마다 다르게 다룬다 (#521)", () => {
  const prev: V4Pending = { one: 500_000, q25: 7, q75: 18, reverseSell: 3, reverseFirst: false };
  const sent = (over: Partial<V4Pending> = {}): V4Pending =>
    ({ one: 999, q25: 0, q75: 0, reverseSell: 0, reverseFirst: false, ...over });

  it("오늘 낸 q75 를 기록한다 — 이게 안 남아서 T 가 틀어졌다", () => {
    expect(mergeDegradedPending(prev, sent({ q75: 24 }), "sell").q75).toBe(24);
  });

  it("전일 one 을 보존한다 — 낡은 cycleCash 로 계산한 값을 쓰면 T 증분이 틀린다", () => {
    expect(mergeDegradedPending(prev, sent({ q75: 24 }), "sell").one).toBe(500_000);
  });

  it("오늘 안 낸 칸은 0 — 어제 LOC 는 종가에 소멸해 남아 있지 않다", () => {
    const r = mergeDegradedPending(prev, sent({ q75: 24 }), "sell");
    expect(r.q25).toBe(0);
    expect(r.reverseSell).toBe(0);
  });

  it("q75 를 안 냈으면 0 으로 — 어제 것을 남겨 두면 없는 주문을 있다고 한다", () => {
    expect(mergeDegradedPending(prev, sent(), "sell").q75).toBe(0);
  });

  it("buy phase 는 q75 를 앞 phase(sell) 것으로 이어받는다 — #483 과 같은 이유", () => {
    // 국장 buy(15:20)는 q75 를 아예 안 낸다(phase 가드). 0 으로 덮으면 sell 이 건 ¾ 익절이 사라진다.
    const r = mergeDegradedPending(prev, sent(), "buy");
    expect(r.q75).toBe(18);
    expect(r.one).toBe(500_000);
  });

  it("reverseFirst 도 q75 와 같은 규칙", () => {
    expect(mergeDegradedPending(prev, sent({ reverseFirst: true }), "sell").reverseFirst).toBe(true);
    expect(mergeDegradedPending({ ...prev, reverseFirst: true }, sent(), "buy").reverseFirst).toBe(true);
  });

  it("입력을 건드리지 않는다", () => {
    const snap = JSON.stringify(prev);
    mergeDegradedPending(prev, sent({ q75: 1 }), "sell");
    expect(JSON.stringify(prev)).toBe(snap);
  });
});

// #523 — V4Pending 이 "오늘 발주한 것" 과 "체결일에 걸려 있던 예약" 두 역할을 겸해
// 같은 자리에서 세 번 회귀했다(#519 → #521 → 3차 감사). 발주일 키로 가른다.
//
// reconcileDay 는 **체결일의 예약**으로 매도 종류를 가려야 한다:
//   q75(¾ 익절 지정가) 수량이면 T ×0.25 · q25(¼ LOC) 수량이면 ×0.75
describe("reconcileDay — 체결일의 예약으로 가린다 (#523)", () => {
  const base = (over: Partial<V4State> = {}): V4State => ({
    ...newV4State("069500", 20, 10_000_000), t: 10, cycleCash: 5_000_000,
    pendingByDate: {}, ...over,
  });
  const sell = (qty: number) => [{ side: "sell" as const, qty, price: 100 }];

  it("D-1 의 ¼매도가 D-1 예약으로 읽혀 ×0.75 된다 — #521 은 이걸 0 으로 지웠다", () => {
    const s = base({ pendingByDate: {
      "20260813": { one: 1000, q25: 12, q75: 0, reverseSell: 0, reverseFirst: false },
      "20260814": { one: 0, q25: 0, q75: 24, reverseSell: 0, reverseFirst: false },
    } });
    expect(reconcileDay(s, sell(12), 36, "20260813").t).toBeCloseTo(7.5, 6);
  });

  it("창이 이틀이어도 둘째 날 예약이 살아 있다 — 예전엔 첫 날 처리 후 비웠다", () => {
    let s = base({ pendingByDate: {
      "20260813": { one: 1000, q25: 12, q75: 0, reverseSell: 0, reverseFirst: false },
      "20260814": { one: 1000, q25: 0, q75: 24, reverseSell: 0, reverseFirst: false },
    } });
    s = reconcileDay(s, sell(12), 36, "20260813");   // ×0.75 → 7.5
    s = reconcileDay(s, sell(24), 12, "20260814");   // q75 → ×0.25
    expect(s.t).toBeCloseTo(7.5 * 0.25, 6);
  });

  it("처리한 날의 예약은 지운다 — 같은 체결을 두 번 읽으면 안 된다", () => {
    const s = base({ pendingByDate: {
      "20260813": { one: 1000, q25: 12, q75: 0, reverseSell: 0, reverseFirst: false },
    } });
    expect(reconcileDay(s, sell(12), 36, "20260813").pendingByDate["20260813"]).toBeUndefined();
  });

  it("그 날 예약이 없으면 T 를 건드리지 않는다 — 모르면 가만히 둔다", () => {
    const s = base({ pendingByDate: {} });
    expect(reconcileDay(s, sell(12), 36, "20260813").t).toBe(10);
  });

  it("매수의 T 증분도 그 날 one 을 쓴다", () => {
    const s = base({ t: 2, pendingByDate: {
      "20260813": { one: 500_000, q25: 0, q75: 0, reverseSell: 0, reverseFirst: false },
      "20260814": { one: 999_999, q25: 0, q75: 0, reverseSell: 0, reverseFirst: false },
    } });
    const r = reconcileDay(s, [{ side: "buy", qty: 5, price: 100_000 }], 40, "20260813");
    expect(r.t).toBeCloseTo(2 + 500_000 / 500_000, 6); // 다른 날 one(999,999)을 쓰면 안 된다
  });

  it("전량 소진이면 사이클이 끝나고 예약도 전부 비운다", () => {
    const s = base({ pendingByDate: {
      "20260813": { one: 1000, q25: 12, q75: 0, reverseSell: 0, reverseFirst: false },
      "20260814": { one: 1000, q25: 0, q75: 24, reverseSell: 0, reverseFirst: false },
    } });
    const r = reconcileDay(s, sell(36), 0, "20260813");
    expect(r.t).toBe(0);
    expect(Object.keys(r.pendingByDate)).toHaveLength(0);
  });

  it("옛 상태(pendingByDate 없음)도 던지지 않는다 — 마이그레이션 없이 넘어간다", () => {
    const legacy = { ...newV4State("069500", 20, 10_000_000), t: 10 } as V4State;
    delete (legacy as { pendingByDate?: unknown }).pendingByDate;
    expect(() => reconcileDay(legacy, sell(12), 36, "20260813")).not.toThrow();
  });
});

describe("recordPending — 발주일 칸에 쌓는다 (#523)", () => {
  it("같은 날 두 phase 가 서로 덮지 않는다 — 국장 sell 09:30 / buy 15:20", () => {
    let m = recordPending({}, "20260814", { one: 0, q25: 0, q75: 24, reverseSell: 0, reverseFirst: false });
    m = recordPending(m, "20260814", { one: 500_000, q25: 8, q75: 0, reverseSell: 0, reverseFirst: false });
    expect(m["20260814"]).toMatchObject({ q75: 24, q25: 8, one: 500_000 });
  });

  it("다른 날은 따로 쌓인다", () => {
    let m = recordPending({}, "20260813", { one: 1, q25: 12, q75: 0, reverseSell: 0, reverseFirst: false });
    m = recordPending(m, "20260814", { one: 2, q25: 0, q75: 24, reverseSell: 0, reverseFirst: false });
    expect(Object.keys(m).sort()).toEqual(["20260813", "20260814"]);
  });

  it("오래된 날은 버린다 — 문서가 무한정 자라면 안 된다", () => {
    let m: Record<string, V4Pending> = {};
    for (let i = 1; i <= 30; i++) {
      m = recordPending(m, `202608${String(i).padStart(2, "0")}`,
        { one: i, q25: 0, q75: 0, reverseSell: 0, reverseFirst: false });
    }
    expect(Object.keys(m).length).toBeLessThanOrEqual(15);
    expect(m["20260830"]).toBeDefined();   // 최근 것은 남는다
    expect(m["20260801"]).toBeUndefined(); // 오래된 것은 밀려났다
  });

  it("입력을 건드리지 않는다", () => {
    const m = { "20260813": { one: 1, q25: 0, q75: 0, reverseSell: 0, reverseFirst: false } };
    const snap = JSON.stringify(m);
    recordPending(m, "20260814", { one: 2, q25: 0, q75: 0, reverseSell: 0, reverseFirst: false });
    expect(JSON.stringify(m)).toBe(snap);
  });
});
