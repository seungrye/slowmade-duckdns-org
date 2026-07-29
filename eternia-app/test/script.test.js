import { describe, it, expect } from "vitest";
import { interpolate, parseScript, stripDirectives } from "../src/script.js";

describe("interpolate", () => {
  it("{{키}} 를 vars 로 치환", () => {
    expect(interpolate("너는 {{route}}로", { route: "정문" })).toBe("너는 정문로");
  });
  it("미정의 키는 원문 유지", () => {
    expect(interpolate("{{x}}", {})).toBe("{{x}}");
  });
  it("vars 없으면 원문 그대로", () => {
    expect(interpolate("{{x}}")).toBe("{{x}}");
  });
  it("숫자 값도 문자열로", () => {
    expect(interpolate("{{n}}개", { n: 3 })).toBe("3개");
  });
});

describe("parseScript", () => {
  it("텍스트+디렉티브 순서열로 분해", () => {
    expect(parseScript("칼 <<sfx clash 0.5>> 소리")).toEqual([
      { kind: "text", text: "칼 " },
      { kind: "directive", cmd: "sfx", args: ["clash", "0.5"], raw: "sfx clash 0.5" },
      { kind: "text", text: " 소리" },
    ]);
  });
  it("디렉티브 없으면 단일 텍스트(하위호환)", () => {
    expect(parseScript("그냥 문장")).toEqual([{ kind: "text", text: "그냥 문장" }]);
  });
  it("빈 <<>> 는 무시", () => {
    expect(parseScript("a <<>> b")).toEqual([
      { kind: "text", text: "a " },
      { kind: "text", text: " b" },
    ]);
  });
  it("텍스트 런에 {{변수}} 치환", () => {
    const segs = parseScript("너는 {{route}} <<fx flash>>", { route: "정문" });
    expect(segs[0]).toEqual({ kind: "text", text: "너는 정문 " });
    expect(segs[1].cmd).toBe("fx");
  });
});

describe("stripDirectives", () => {
  it("디렉티브 제거 + {{변수}} 치환", () => {
    expect(stripDirectives("너는 {{route}} <<img a impact>> 간다", { route: "정문" })).toBe(
      "너는 정문  간다",
    );
  });
});
