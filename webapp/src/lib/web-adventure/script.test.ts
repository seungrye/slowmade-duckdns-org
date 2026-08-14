import { describe, it, expect } from "vitest";
import { interpolate, parseScript } from "./script";

describe("interpolate — {{변수}} 치환", () => {
  it("정의된 변수를 값으로 치환", () => {
    expect(interpolate("너는 {{route}}로 갔다", { route: "정문 초소" })).toBe("너는 정문 초소로 갔다");
  });
  it("숫자 변수도 문자열로", () => {
    expect(interpolate("남은 {{n}}회", { n: 3 })).toBe("남은 3회");
  });
  it("미정의 변수는 원문 유지(작가 오탈자 노출용)", () => {
    expect(interpolate("{{unknown}} 값", {})).toBe("{{unknown}} 값");
  });
  it("vars 없으면 원문 그대로", () => {
    expect(interpolate("변수 {{x}} 없음")).toBe("변수 {{x}} 없음");
  });
  it("여러 변수", () => {
    expect(interpolate("{{a}}와 {{b}}", { a: "가", b: "나" })).toBe("가와 나");
  });
});

describe("parseScript — 표시 텍스트 + << >> 디렉티브 순서 분해", () => {
  it("디렉티브 없는 문단은 text 세그먼트 하나(기존 씬 무손상)", () => {
    expect(parseScript("평범한 묘사 문단.")).toEqual([{ kind: "text", text: "평범한 묘사 문단." }]);
  });
  it("문장 중간 디렉티브를 순서대로 분해", () => {
    expect(parseScript("덤불이 <<sfx 바스락>> 흔들린다.")).toEqual([
      { kind: "text", text: "덤불이 " },
      { kind: "directive", cmd: "sfx", args: ["바스락"], raw: "sfx 바스락" },
      { kind: "text", text: " 흔들린다." },
    ]);
  });
  it("단독 디렉티브 라인(앞뒤 빈 텍스트 제외)", () => {
    expect(parseScript("<<fx fadeout 800>>")).toEqual([
      { kind: "directive", cmd: "fx", args: ["fadeout", "800"], raw: "fx fadeout 800" },
    ]);
  });
  it("연속 디렉티브는 빈 텍스트 없이", () => {
    expect(parseScript("<<bgm pause>><<wait 500>>")).toEqual([
      { kind: "directive", cmd: "bgm", args: ["pause"], raw: "bgm pause" },
      { kind: "directive", cmd: "wait", args: ["500"], raw: "wait 500" },
    ]);
  });
  it("{{변수}}는 표시 텍스트에서 치환", () => {
    expect(parseScript("너는 {{route}}로 <<sfx 발소리>> 스며든다", { route: "뒷골목" })).toEqual([
      { kind: "text", text: "너는 뒷골목로 " },
      { kind: "directive", cmd: "sfx", args: ["발소리"], raw: "sfx 발소리" },
      { kind: "text", text: " 스며든다" },
    ]);
  });
  it("img/bgm 인자 파싱", () => {
    expect(parseScript("<<img 매복 impact>>")).toEqual([
      { kind: "directive", cmd: "img", args: ["매복", "impact"], raw: "img 매복 impact" },
    ]);
    expect(parseScript("<<bgm play harbor 500>>")[0]).toMatchObject({ cmd: "bgm", args: ["play", "harbor", "500"] });
  });
  it("빈 << >> 는 무시(텍스트로도 남기지 않음)", () => {
    expect(parseScript("<<>>")).toEqual([]);
  });

// #370 — 한국어로 쓰는 이야기라 변수명도 한글이어야 자연스럽다. `\w` 는 ASCII 만 매치했다.
describe('interpolate — 한글 변수명', () => {
  it('한글 변수명을 치환한다', () => {
    expect(interpolate('손을 뻗는다. {{침식_손}}', { 침식_손: '손끝이 시리다.' }))
      .toBe('손을 뻗는다. 손끝이 시리다.');
  });

  it('영문·숫자 변수명도 종전대로', () => {
    expect(interpolate('{{name}} {{n2}}', { name: 'Kael', n2: 7 })).toBe('Kael 7');
  });

  it('미정의 변수는 원문을 남긴다 — 오탈자를 감추지 않는다', () => {
    expect(interpolate('{{없는변수}}', { 있는변수: 'x' })).toBe('{{없는변수}}');
  });
});
});
