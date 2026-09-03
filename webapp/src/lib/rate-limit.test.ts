import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, __resetRateLimit, clientIp } from "./rate-limit";

describe("rateLimit — 슬라이딩 윈도우", () => {
  beforeEach(() => __resetRateLimit());

  it("limit 회까지 허용, 초과분은 차단", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, 0)).toBe(true);
    expect(rateLimit("k", 3, 1000, 0)).toBe(false); // 4번째 차단
  });

  it("윈도우가 지나면 다시 허용", () => {
    for (let i = 0; i < 3; i++) rateLimit("k", 3, 1000, 0);
    expect(rateLimit("k", 3, 1000, 999)).toBe(false); // 아직 윈도우 안
    expect(rateLimit("k", 3, 1000, 1001)).toBe(true); // 윈도우 경과 → 허용
  });

  it("키가 다르면 독립적으로 카운트", () => {
    expect(rateLimit("a", 1, 1000, 0)).toBe(true);
    expect(rateLimit("a", 1, 1000, 0)).toBe(false);
    expect(rateLimit("b", 1, 1000, 0)).toBe(true); // 다른 키는 영향 없음
  });
});

describe("clientIp — 스푸핑 불가해야 한다 (#386)", () => {
  const mk = (h: Record<string, string>) => ({ headers: { get: (n: string) => h[n.toLowerCase()] ?? null } });

  it("X-Real-IP 를 먼저 쓴다 — nginx 가 $remote_addr 로 세팅(덮어씀)하는 위조 불가 값", () => {
    // 공격자가 XFF 를 위조해도 X-Real-IP 가 이긴다.
    expect(clientIp(mk({ "x-forwarded-for": "1.2.3.4, 203.0.113.9", "x-real-ip": "203.0.113.9" })))
      .toBe("203.0.113.9");
  });

  it("XFF 폴백은 **마지막** 항목 — nginx 가 $proxy_add_x_forwarded_for 로 실제 IP 를 뒤에 붙인다", () => {
    // X-Real-IP 가 없을 때(직접 접속 등)도 첫 항목(공격자값)을 쓰지 않는다.
    expect(clientIp(mk({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("공격자가 XFF 첫 항목을 아무리 바꿔도 반환값은 실제 IP 로 고정된다", () => {
    const real = "203.0.113.9";
    const a = clientIp(mk({ "x-forwarded-for": `9.9.9.9, ${real}`, "x-real-ip": real }));
    const b = clientIp(mk({ "x-forwarded-for": `8.8.8.8, ${real}`, "x-real-ip": real }));
    expect(a).toBe(real);
    expect(b).toBe(real);
    expect(a).toBe(b); // 같은 버킷 — 레이트리밋이 뚫리지 않는다
  });

  it("XFF 만 있고 항목이 하나면 그것을 쓴다", () => {
    expect(clientIp(mk({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("아무 헤더도 없으면 unknown", () => {
    expect(clientIp(mk({}))).toBe("unknown");
  });

  it("빈 값·공백은 건너뛴다", () => {
    expect(clientIp(mk({ "x-forwarded-for": "  ", "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(mk({ "x-forwarded-for": "1.2.3.4, , 203.0.113.9" }))).toBe("203.0.113.9");
  });
});
