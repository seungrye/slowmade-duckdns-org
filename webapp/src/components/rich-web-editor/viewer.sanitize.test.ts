import { describe, it, expect } from "vitest";
import { sanitizeStyle, sanitizeSrc } from "./viewer";

describe("viewer sanitizeStyle — CSS 인젝션 방어", () => {
  it("레이아웃 스타일은 유지한다", () => {
    expect(sanitizeStyle("display:flex;justify-content:center;margin:14px 0"))
      .toBe("display:flex;justify-content:center;margin:14px 0");
  });
  it("url()(외부 리소스 로드)를 제거한다", () => {
    expect(sanitizeStyle("background:url(https://evil/track.png)")).not.toMatch(/url\s*\(/i);
  });
  it("@import·expression·javascript: 를 제거한다", () => {
    const out = sanitizeStyle("@import 'x'; width:expression(alert(1)); color:javascript:alert(1)");
    expect(out).not.toMatch(/@import/i);
    expect(out).not.toMatch(/expression\s*\(/i);
    expect(out).not.toMatch(/javascript:/i);
  });
  it("문자열이 아니면 빈 문자열", () => {
    expect(sanitizeStyle(null)).toBe("");
    expect(sanitizeStyle({ evil: 1 })).toBe("");
  });
});

describe("viewer sanitizeSrc — 이미지 src 스킴 제한", () => {
  it("http(s)·data:image 는 허용", () => {
    expect(sanitizeSrc("https://x/a.png")).toBe("https://x/a.png");
    expect(sanitizeSrc("data:image/png;base64,AAA")).toBe("data:image/png;base64,AAA");
  });
  it("javascript:·기타 스킴은 차단(빈 문자열)", () => {
    expect(sanitizeSrc("javascript:alert(1)")).toBe("");
    expect(sanitizeSrc("data:text/html,<script>")).toBe("");
    expect(sanitizeSrc(null)).toBe("");
  });
});
