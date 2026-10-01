import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret } from "./crypto";
import { lrsDecide, momentum, rotationDecide, smaNewest, trendDecide } from "./strategies";
import { addMinutes, canRetryRun, firstTradingPhase, isDue, marketClock, mayRetryRun, missingRunDates, staleRunNotice, isUnknownAck } from "./scheduler";
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
    // 3번째 인자는 #525 부터 '접수 불명 수' 다 — maxRetries 는 4번째.
    expect(canRetryRun(failed({ attempts: 2 }), 0, 0, 2)).toBe(false);
    expect(canRetryRun(failed({ attempts: 1 }), 0, 0, 2)).toBe(true);
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

// #507 — catch-up 에 상한이 없어 장 마감 뒤에도 그날 계획이 그대로 주문됐다.
describe("scheduler.isDue — catch-up 상한", () => {
  const clock = (hhmm: string) => ({ dateKey: "2026-09-30", hhmm, isWeekday: true });
  it("정시~90분 안이면 돈다", () => {
    expect(isDue({ runAt: "09:35" }, clock("09:35"))).toBe(true);
    expect(isDue({ runAt: "09:35" }, clock("11:05"))).toBe(true);
  });
  it("90분을 넘기면 그날은 건너뛴다 — 종가 기준 주문이 마감 뒤에 나가면 안 된다", () => {
    expect(isDue({ runAt: "09:35" }, clock("11:06"))).toBe(false);
    expect(isDue({ runAt: "09:35" }, clock("16:30"))).toBe(false);
  });
  it("마감 sync(close)는 늦어도 돈다 — 차트·메일이라 무해하다", () => {
    expect(isDue({ runAt: "16:10", phase: "close" }, clock("23:50"))).toBe(true);
  });
  it("자정을 넘기면 23:59 로 고정한다", () => {
    expect(addMinutes("23:30", 90)).toBe("23:59");
    expect(addMinutes("09:35", 90)).toBe("11:05");
  });
});

// #511 — #507 이 '거부도 원장에 남긴다' 를 넣으면서 #487 재시도 가드가 깨졌다.
// 가드의 근거는 "실주문이 나갔나" 인데, 거부 행(orderNo="")까지 세면 **첫 주문의 일시
// 오류 하나로 그날 사이클이 영구 포기**된다. 세야 하는 건 실제로 접수된 것뿐이다.
describe("canRetryRun — 거부 행은 '나간 주문' 이 아니다 (#511)", () => {
  const failed = { status: "failed", attempts: 0 };

  it("접수된 주문이 0이면 재시도한다 — 거부만 있었어도", () => {
    expect(canRetryRun(failed, 0)).toBe(true);
  });

  it("접수된 주문이 있으면 재시도하지 않는다 — 중복 주문이 유실보다 위험하다", () => {
    expect(canRetryRun(failed, 1)).toBe(false);
  });
});

// #521 — 사이클이 **아예 안 돈 날**을 잡는 장치가 없었다. 실측으로 2026-09-04 미장 하루가
// run·메일·에러 0건으로 통째 유실됐다(호스트 다운 + catch-up 90분 상한 + 다음 날 토요일).
// 운영자는 시스템이 돌고 있다고 믿는다.
//
// ⚠ catch-up 상한을 늘려 고치면 안 된다 — 마감 후 LOC 가 엉뚱한 가격에 걸린다.
// 고칠 지점은 **결손 감지·통보**다.
describe("missingRunDates — 어제 돌았어야 할 사이클이 비었는지 (#521)", () => {
  const pf = { market: "kr" as const, runAt: "09:30", weekdaysOnly: true };

  it("어제가 평일인데 run 이 하나도 없으면 결손", () => {
    expect(missingRunDates(pf, [], "2026-10-01", ["sell"])).toEqual(["2026-09-30"]);
  });

  it("어제 run 이 있으면 결손 아님", () => {
    expect(missingRunDates(pf, [{ dateKey: "2026-09-30", phase: "sell", status: "done" }], "2026-10-01", ["sell"])).toEqual([]);
  });

  it("어제가 주말이면 보지 않는다 — weekdaysOnly", () => {
    // 2026-10-04(일) → 어제 10-03(토). 가장 가까운 평일은 10-02(금).
    expect(missingRunDates(pf, [{ dateKey: "2026-10-02", phase: "sell", status: "done" }], "2026-10-04", ["sell"])).toEqual([]);
    expect(missingRunDates(pf, [], "2026-10-04", ["sell"])).toEqual(["2026-10-02"]);
  });

  it("weekdaysOnly 가 아니면 주말도 본다", () => {
    expect(missingRunDates({ ...pf, weekdaysOnly: false }, [], "2026-10-04", ["sell"])).toEqual(["2026-10-03"]);
  });

  it("월 경계를 넘어간다", () => {
    expect(missingRunDates(pf, [], "2026-10-01", ["sell"])).toEqual(["2026-09-30"]);
  });

  it("빈 날짜 목록이 와도 던지지 않는다", () => {
    expect(() => missingRunDates(pf, [], "2026-10-01", ["sell"])).not.toThrow();
  });
});

// #523 ③ — 프로세스가 죽은 사이클은 **메일 없이** failed 가 됐다. 실패 메일이 in-process
// catch 안에만 있어서, systemctl stop 으로 죽은 런은 catch 에 도달하지 못하고 다음 틱의
// stale→failed 전환은 updateOne 뿐이었다. 배포마다 이 경로가 생긴다.
describe("staleRunNotice — 죽은 사이클을 사람에게 알린다 (#523)", () => {
  const at = new Date("2026-10-01T04:30:00Z");
  const n = staleRunNotice(
    { envKey: "paper-1", market: "kr", strategy: "infinite_v4", symbol: "069500" },
    "2026-10-01", "sell", at,
  );

  it("제목에 어느 블록인지 들어간다 — 받은편지함에서 바로 구분돼야 한다", () => {
    expect(n.subject).toContain("069500");
    expect(n.subject).toContain("sell");
  });

  it("본문에 시작 시각과 원인 후보가 들어간다", () => {
    expect(n.body).toContain("2026-10-01");
    expect(n.body).toMatch(/배포|재시작|크래시/);
  });

  it("종목이 없는 전략도 던지지 않는다", () => {
    expect(() => staleRunNotice(
      { envKey: "paper-1", market: "us", strategy: "trend_v1" }, "2026-10-01", "main", at,
    )).not.toThrow();
  });
});

// #525 ① — 주문 POST 가 타임아웃·네트워크로 끊기면 **KIS 가 받았는지 모른다**.
// 그런데 거부와 똑같이 orderNo:"" 로 적혀서, 재시도 가드가 "주문 안 나갔다" 로 읽고
// 같은 수량을 다시 낸다. 중복 주문이 유실보다 위험하다.
describe("isUnknownAck — 접수 여부를 모르는 실패를 가린다 (#525)", () => {
  it("타임아웃은 접수 불명이다", () => {
    expect(isUnknownAck("The operation was aborted due to timeout")).toBe(true);
    expect(isUnknownAck("TimeoutError: signal timed out")).toBe(true);
  });

  it("네트워크 끊김도 접수 불명이다 — 요청이 갔는지 모른다", () => {
    expect(isUnknownAck("fetch failed")).toBe(true);
    expect(isUnknownAck("ECONNRESET")).toBe(true);
    expect(isUnknownAck("socket hang up")).toBe(true);
  });

  it("증권사가 분명히 거부한 것은 접수 불명이 아니다 — 안 나갔다", () => {
    expect(isUnknownAck("40910000: 모의투자 주문이 불가한 계좌입니다.")).toBe(false);
    expect(isUnknownAck("40250000: 주문가능금액이 부족합니다")).toBe(false);
    expect(isUnknownAck("EGW00201: 초당 거래건수를 초과하였습니다.")).toBe(false);
  });

  it("빈 문자열은 모른다고 보지 않는다 — 과잉 차단을 피한다", () => {
    expect(isUnknownAck("")).toBe(false);
  });
});

// 가드는 "접수된 것" + "접수 불명" 을 **둘 다** 나갔을 수 있는 것으로 세야 한다.
describe("canRetryRun — 접수 불명이면 재시도하지 않는다 (#525)", () => {
  const failed = { status: "failed", attempts: 0 };
  it("접수 0건이면 재시도한다 — 종전과 같다", () => {
    expect(canRetryRun(failed, 0)).toBe(true);
  });
  it("접수가 있으면 안 한다", () => {
    expect(canRetryRun(failed, 1)).toBe(false);
  });
  it("접수 불명 1건만 있어도 안 한다 — 중복 주문이 유실보다 위험하다", () => {
    expect(canRetryRun(failed, 0, 1)).toBe(false);
  });
});

// #525 ② — 결손 점검이 "그 날 run 문서가 있나" 만 봐서, running 1건이 그날 전체를 가렸다.
// 국장 v4 는 하루 3사이클(sell/buy/close)이라 phase 단위로 봐야 한다.
describe("missingRunDates — status·phase 를 본다 (#525)", () => {
  const pf = { market: "kr" as const, runAt: "09:30", weekdaysOnly: true };

  it("done 인 phase 만 '돌았다' 로 센다 — running/failed 는 안 돈 것과 같다", () => {
    expect(missingRunDates(pf, [{ dateKey: "2026-09-30", phase: "sell", status: "running" }],
      "2026-10-01", ["sell"])).toEqual(["2026-09-30"]);
    expect(missingRunDates(pf, [{ dateKey: "2026-09-30", phase: "sell", status: "done" }],
      "2026-10-01", ["sell"])).toEqual([]);
  });

  it("phase 하나가 비면 결손이다 — sell 만 돌고 buy 가 빠진 날", () => {
    const runs = [{ dateKey: "2026-09-30", phase: "sell", status: "done" }];
    expect(missingRunDates(pf, runs, "2026-10-01", ["sell", "buy"])).toEqual(["2026-09-30"]);
  });

  it("필요한 phase 가 다 done 이면 결손 아님", () => {
    const runs = [
      { dateKey: "2026-09-30", phase: "sell", status: "done" },
      { dateKey: "2026-09-30", phase: "buy", status: "done" },
    ];
    expect(missingRunDates(pf, runs, "2026-10-01", ["sell", "buy"])).toEqual([]);
  });

  it("주말은 그대로 건너뛴다 — 회귀 방지", () => {
    expect(missingRunDates(pf, [{ dateKey: "2026-10-02", phase: "sell", status: "done" }],
      "2026-10-04", ["sell"])).toEqual([]);
  });
});
