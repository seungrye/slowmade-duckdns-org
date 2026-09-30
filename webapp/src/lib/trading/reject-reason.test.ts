import { describe, expect, it } from "vitest";
import { classifyReject, summarizeRejects } from "./reject-reason";

// #509 — 휴장일 달력 대신 **거부 사유 분류**. 증권사가 이미 판단한 걸 전달만 하므로
// 연도 개념이 없다 — 갱신할 표가 없고 2050년에도 그대로 동작한다.

describe("classifyReject — 사람이 할 일로 가른다", () => {
  it("휴장일은 조치할 것이 없다", () => {
    const r = classifyReject("40910001: 장운영일이 아닙니다");
    expect(r.kind).toBe("holiday");
    expect(r.needsAction).toBe(false);
  });

  it("계좌 문제는 사람이 조치해야 풀린다 — 실측된 그 메시지", () => {
    // 2026-09-25~ 실제로 6영업일간 반복된 것. 모의투자 참가 기간 만료였다.
    const r = classifyReject("40910000: 모의투자 주문이 불가한 계좌입니다.");
    expect(r.kind).toBe("account");
    expect(r.needsAction).toBe(true);
    expect(r.advice).toContain("증권사");
  });

  it("자금 부족", () => {
    expect(classifyReject("40250000: 주문가능금액이 부족합니다").kind).toBe("funds");
  });

  it("호가단위·가격제한은 코드 버그일 수 있다", () => {
    expect(classifyReject("40030000: 호가단위 오류").kind).toBe("order");
  });

  it("일시 오류는 다음 사이클에 풀린다", () => {
    expect(classifyReject("EGW00201: 초당 거래건수를 초과하였습니다.").needsAction).toBe(false);
    expect(classifyReject("90020000: 모의투자 서비스가 지연되고 있습니다").kind).toBe("transient");
    expect(classifyReject("OPSQ0003: 서비스 라우팅 오류").kind).toBe("transient");
  });

  it("코드가 없어도 문구로 잡는다 — 증권사 표현이 제각각이다", () => {
    expect(classifyReject("오늘은 휴장일입니다").kind).toBe("holiday");
    expect(classifyReject("사용자권한이 없습니다").kind).toBe("account");
  });

  it("모르는 사유는 모른다고 하고, 사람이 보게 한다", () => {
    const r = classifyReject("99999999: 처음 보는 무엇");
    expect(r.kind).toBe("unknown");
    expect(r.needsAction).toBe(true); // 조용히 넘기는 쪽이 더 위험하다
  });

  it("빈 문자열에 던지지 않는다", () => {
    expect(classifyReject("").kind).toBe("unknown");
  });
});

describe("summarizeRejects — 가장 무거운 사유가 이긴다", () => {
  it("휴장 10건 + 계좌 1건이면 계좌를 말한다", () => {
    const s = summarizeRejects([
      ...Array(10).fill("40910001: 장운영일이 아닙니다"),
      "40910000: 모의투자 주문이 불가한 계좌입니다.",
    ]);
    expect(s.kind).toBe("account");
    expect(s.needsAction).toBe(true);
    expect(s.counts.holiday).toBe(10);
    expect(s.counts.account).toBe(1);
  });

  it("전부 휴장이면 조치 불필요로 남는다", () => {
    const s = summarizeRejects(Array(5).fill("휴장일입니다"));
    expect(s.kind).toBe("holiday");
    expect(s.needsAction).toBe(false);
  });

  it("모르는 사유가 일시 오류보다 무겁다", () => {
    expect(summarizeRejects(["EGW00201: 초당 거래건수", "??? 처음 보는 것"]).kind).toBe("unknown");
  });

  it("거부가 없으면 조치 불필요", () => {
    expect(summarizeRejects([]).needsAction).toBe(false);
  });
});
