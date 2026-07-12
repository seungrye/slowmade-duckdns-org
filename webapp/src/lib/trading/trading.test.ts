import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret } from "./crypto";
import { lrsDecide, momentum, rotationDecide, smaNewest, trendDecide } from "./strategies";
import { isDue, marketClock } from "./scheduler";

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
