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

describe("clientIp", () => {
  const mk = (h: Record<string, string>) => ({ headers: { get: (n: string) => h[n.toLowerCase()] ?? null } });
  it("x-forwarded-for 첫 항목", () => {
    expect(clientIp(mk({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });
  it("없으면 x-real-ip, 그것도 없으면 unknown", () => {
    expect(clientIp(mk({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(mk({}))).toBe("unknown");
  });
});
