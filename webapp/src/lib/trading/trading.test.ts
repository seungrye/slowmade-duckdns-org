import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret } from "./crypto";
import { lrsDecide, momentum, rotationDecide, smaNewest, trendDecide } from "./strategies";
import { canRetryRun, firstTradingPhase, isDue, marketClock, mayRetryRun } from "./scheduler";
import { krTickRound, krTickSize } from "./kr-tick";
import { valueHoldings } from "./close-sync";

beforeAll(() => {
  process.env.TRADING_SECRET_KEY = "a".repeat(64);
});

describe("trading/crypto — AES-256-GCM", () => {
  it("암복호 왕복 + 블롭은 평문 미포함", () => {
    const blob = encryptSecret("PSxxSECRET-123");
    expect(blob).not.toContain("SECRET");
    expect(decryptSecret(blob)).toBe("PSxxSECRET-123");
  });
  it("변조된 블롭은 복호 실패(GCM 인증)", () => {
    const blob = encryptSecret("secret");
    const [iv, tag, ct] = blob.split(":");
    const tampered = `${iv}:${tag}:${Buffer.from("xx" + Buffer.from(ct, "base64").toString("binary").slice(2), "binary").toString("base64")}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });
  it("마스킹은 앞 4자만", () => {
    expect(maskSecret("PSABCDEFG")).toBe("PSAB…(9자)");
    expect(maskSecret("ab")).toBe("····");
  });
});

// 파이썬 tests/test_new_strategies.py 와 같은 벡터 — TS↔py 규칙 일치 확인.
describe("trading/strategies — 파이썬 대응 벡터", () => {
  it("LRS: 레짐 온 진입(시그널 12 > sma3 10)", () => {
    const out = lrsDecide({
      signalCloses: [12, 10, 10, 10], target: "TQQQ", price: 100,
      holdingQty: 0, avgPrice: 0, cash: 10_000, smaPeriod: 3, bandPct: 0,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ side: "buy", qty: 100 });
  });
  it("LRS: 레짐 오프 전량 청산", () => {
    const out = lrsDecide({
      signalCloses: [8, 10, 10, 10], target: "TQQQ", price: 100,
      holdingQty: 10, avgPrice: 120, cash: 0, smaPeriod: 3, bandPct: 0,
    });
    expect(out[0]).toMatchObject({ side: "sell", qty: 10 });
  });
  it("LRS: 워밍업 부족이면 무신호", () => {
    expect(lrsDecide({ signalCloses: [10, 10], target: "T", price: 1,
                       holdingQty: 0, avgPrice: 0, cash: 100, smaPeriod: 3 })).toEqual([]);
  });

  it("rotation: 레짐 온 진입 시 모멘텀 1위 선택", () => {
    const d = rotationDecide({
      candidates: ["A", "B"], signalCloses: [12, 10, 10, 10],
      candCloses: { A: [100, 100, 100, 100], B: [130, 120, 100, 100] },
      holding: null, daysSinceRebalance: 0, smaPeriod: 3, bandPct: 0, momDays: 2, rebalanceDays: 2,
    });
    expect(d.action).toBe("switch");
    expect(d.target).toBe("B");
    expect(d.rebalanced).toBe(true);
  });
  it("rotation: 레짐 오프면 주기 무관 즉시 현금", () => {
    const d = rotationDecide({
      candidates: ["A", "B"], signalCloses: [8, 10, 10, 10],
      candCloses: { A: [100, 100, 100], B: [100, 100, 100] },
      holding: "B", daysSinceRebalance: 0, smaPeriod: 3, bandPct: 0, momDays: 2, rebalanceDays: 99,
    });
    expect(d.action).toBe("cash");
  });
  it("rotation: 재평가 도래 + 1위 교체", () => {
    const d = rotationDecide({
      candidates: ["A", "B"], signalCloses: [12, 11, 10, 10],
      candCloses: { A: [200, 150, 100, 100], B: [100, 100, 100, 100] },
      holding: "B", daysSinceRebalance: 2, smaPeriod: 3, bandPct: 0, momDays: 2, rebalanceDays: 2,
    });
    expect(d.action).toBe("switch");
    expect(d.target).toBe("A");
  });
  it("rotation: 카운터는 호출측 — regimeOn 플래그 노출", () => {
    const d = rotationDecide({
      candidates: ["A", "B"], signalCloses: [12, 10, 10, 10],
      candCloses: { A: [100, 100, 100, 100], B: [100, 100, 100, 100] },
      holding: "A", daysSinceRebalance: 0, smaPeriod: 3, bandPct: 0, momDays: 2, rebalanceDays: 5,
    });
    expect(d.action).toBe("hold");
    expect(d.regimeOn).toBe(true);
  });

  it("trend: 골든크로스 발생일에만 진입", () => {
    // 어제 단기≤장기 → 오늘 단기>장기 (short 2, long 3)
    const closes = [130, 100, 90, 100, 100];
    const out = trendDecide({ symbol: "A", closes, price: 130, holdingQty: 0,
                              principal: 1300, shortMa: 2, longMa: 3 });
    expect(out[0]).toMatchObject({ side: "buy", qty: 10 });
  });
  it("trend: 데드크로스면 보유 전량 청산", () => {
    const closes = [80, 100, 120, 120, 120];
    const out = trendDecide({ symbol: "A", closes, price: 80, holdingQty: 7,
                              principal: 0, shortMa: 2, longMa: 3 });
    expect(out[0]).toMatchObject({ side: "sell", qty: 7 });
  });

  it("momentum/sma 기본", () => {
    expect(momentum([110, 105, 100], 2)).toBeCloseTo(0.1);
    expect(smaNewest([1, 2, 3], 4)).toBeNull();
  });
});

describe("trading/scheduler — 순수 헬퍼", () => {
  it("marketClock: tz 별 날짜키·시각(고정 시각)", () => {
    // 2026-07-13T01:00:00Z = KST 10:00(월) / ET 21:00(일, 07-12)
    const now = new Date("2026-07-13T01:00:00Z");
    const kr = marketClock("kr", now);
    expect(kr.dateKey).toBe("2026-07-13");
    expect(kr.hhmm).toBe("10:00");
    expect(kr.isWeekday).toBe(true);
    const us = marketClock("us", now);
    expect(us.dateKey).toBe("2026-07-12");
    expect(us.isWeekday).toBe(false); // 일요일
  });
  it("isDue: 시각 경과·주중·enabled 조합", () => {
    const clock = { dateKey: "2026-07-13", hhmm: "09:36", isWeekday: true };
    expect(isDue({ runAt: "09:35" }, clock)).toBe(true);   // 경과(catch-up 포함)
    expect(isDue({ runAt: "09:40" }, clock)).toBe(false);  // 아직
    expect(isDue({ runAt: "09:00", enabled: false }, clock)).toBe(false);
    expect(isDue({ runAt: "09:00" }, { ...clock, isWeekday: false })).toBe(false);
    expect(isDue({ runAt: "09:00", weekdaysOnly: false }, { ...clock, isWeekday: false })).toBe(true);
  });
});

describe("kr-tick — KRX 호가단위 라운딩", () => {
  it("오늘 실패 재현: ETF 별지점 매도 138,861.92 → 138,865(5원 올림)", () => {
    expect(krTickRound(138_861.92, "sell")).toBe(138_865);
  });
  it("ETF 평단 매수 126,486 → 126,485(5원 내림)", () => {
    expect(krTickRound(126_486, "buy")).toBe(126_485);
  });
  it("익절 139,134.6 매도 → 139,135(우연히 통과했던 값과 일치)", () => {
    expect(krTickRound(139_134.6, "sell")).toBe(139_135);
  });
  it("주식 테이블: 150,000원대 100원 단위, 962원 1원 단위", () => {
    expect(krTickSize(150_000, "stock")).toBe(100);
    expect(krTickRound(150_795, "buy", "stock")).toBe(150_700);
    expect(krTickRound(962.4, "sell", "stock")).toBe(963);
  });
  it("ETF 는 저가에도 5원 단위(462330 류)", () => {
    expect(krTickRound(962, "buy")).toBe(960);
    expect(krTickRound(962, "sell")).toBe(965);
  });
});

describe("close-sync valueHoldings — 현재가 실패 원가 폴백", () => {
  const H = { TQQQ: [10, 80] as [number, number], SOXL: [5, 20] as [number, number] };
  it("전부 조회 성공: 현재가로 평가", () => {
    const r = valueHoldings(H, (s) => ({ TQQQ: 100, SOXL: 30 }[s] ?? null));
    expect(r.hv).toBe(10 * 100 + 5 * 30);
    expect(r.failed).toEqual([]);
    expect(r.failRatio).toBe(0);
  });
  it("일부 실패: 평단가로 대체(누락 아님)·failed 집계", () => {
    const r = valueHoldings(H, (s) => (s === "TQQQ" ? 100 : null));
    expect(r.hv).toBe(10 * 100 + 5 * 20); // SOXL 은 평단 20
    expect(r.failed).toEqual(["SOXL"]);
    expect(r.failRatio).toBe(0.5);
  });
  it("07-12 재현: 전부 실패해도 평가가 0으로 무너지지 않고 원가", () => {
    const r = valueHoldings(H, () => null);
    expect(r.hv).toBe(10 * 80 + 5 * 20); // 전부 평단
    expect(r.failRatio).toBe(1);         // 호출측이 MAX_FAIL_RATIO 로 스킵
  });
  it("07-14 재현: 현재가 0/NaN(유량제한 빈값)도 실패로 처리 → 원가 폴백", () => {
    // usPrice 가 0(rt_cd=0·last 빈값) 이나 NaN 을 반환해도 0원 평가로 무너지지 않아야 한다.
    expect(valueHoldings(H, (s) => (s === "TQQQ" ? 100 : 0)).hv).toBe(10 * 100 + 5 * 20);
    expect(valueHoldings(H, () => NaN).hv).toBe(10 * 80 + 5 * 20);
    expect(valueHoldings(H, (s) => (s === "TQQQ" ? 0 : NaN)).failed.sort()).toEqual(["SOXL", "TQQQ"]);
  });
  it("보유 없음: 0·failRatio 0(0나눗셈 안전)", () => {
    expect(valueHoldings({}, () => 1)).toMatchObject({ hv: 0, failRatio: 0 });
  });
});

// #487 — 일시 오류로 실패한 사이클은 그날 다시 돌아야 한다. 단, **주문이 이미 나갔으면 안 된다** —
// engines.ts 의 execute() 는 취소 단계가 없어 재실행하면 중복 주문이 난다.
describe("scheduler.canRetryRun — 실패한 사이클 재시도 가늠(순수)", () => {
  const failed = (over: Record<string, unknown> = {}) => ({ status: "failed", attempts: 0, ...over });

  it("실패 + 실주문 0건 + 재시도 여유 → 다시 잡는다", () => {
    expect(canRetryRun(failed(), 0)).toBe(true);
  });
  it("실주문이 한 건이라도 나갔으면 안 잡는다(중복 주문 방지)", () => {
    expect(canRetryRun(failed(), 1)).toBe(false);
  });
  it("재시도 상한에 닿으면 안 잡는다(설정 오류로 하루 종일 돌지 않게)", () => {
    expect(canRetryRun(failed({ attempts: 2 }), 0, 2)).toBe(false);
    expect(canRetryRun(failed({ attempts: 1 }), 0, 2)).toBe(true);
  });
  it("attempts 가 없는 옛 문서는 0 으로 본다", () => {
    expect(canRetryRun({ status: "failed" }, 0)).toBe(true);
  });
  it("성공했거나 아직 도는 중이면 안 잡는다", () => {
    expect(canRetryRun(failed({ status: "done" }), 0)).toBe(false);
    expect(canRetryRun(failed({ status: "running" }), 0)).toBe(false);
  });
  // 원장 조회 전 싼 가드 — 매 틱 countDocuments 를 때리지 않으려는 것.
  it("mayRetryRun 은 주문 원장 없이 status·attempts 만으로 거른다", () => {
    expect(mayRetryRun({ status: "failed", attempts: 0 })).toBe(true);
    expect(mayRetryRun({ status: "done" })).toBe(false);
    expect(mayRetryRun({ status: "running" })).toBe(false);
    expect(mayRetryRun({ status: "failed", attempts: 2 }, 2)).toBe(false);
  });
});

// #488 — run-now 는 **실제로 도는** 사이클을 보여줘야 한다. 예전엔 기본 main → v4 에서 both 로
// 매핑돼, 국장(sell/buy 2단계)은 돌지도 않는 계획을 냈다.
describe("scheduler.firstTradingPhase — run-now 기본 phase", () => {
  it("국장 v4 는 sell(09:30) — both 가 아니다", () => {
    expect(firstTradingPhase({ strategy: "infinite_v4", market: "kr", runAt: "09:30" })).toBe("sell");
  });
  it("미장 v4 는 both", () => {
    expect(firstTradingPhase({ strategy: "infinite_v4", market: "us", runAt: "09:35" })).toBe("both");
  });
  it("그 외 전략은 main", () => {
    expect(firstTradingPhase({ strategy: "value_rebalancing", market: "us", runAt: "10:50" })).toBe("main");
  });
  it("마감(close)은 매매가 아니라 고르지 않는다", () => {
    expect(firstTradingPhase({ strategy: "lrs_v1", market: "us", runAt: "09:35" })).not.toBe("close");
  });
});
