import { describe, it, expect } from "vitest";
import { renderInline } from "./render-inline";

type El = { type: string; props: { className?: string; children?: unknown } };

describe("renderInline — 서식 규약(FORMAT.md) 토큰", () => {
  it("**인물명** → strong(굵게)", () => {
    const [el] = renderInline("**베일 박사**") as El[];
    expect(el.type).toBe("strong");
    expect(el.props.children).toBe("베일 박사");
  });

  it("*지문* → em(회색 이탤릭)", () => {
    const [el] = renderInline("*낮게 속삭이며*") as El[];
    expect(el.type).toBe("em");
    expect(el.props.className).toContain("italic");
  });

  it('"대사" → 호박색 span, 따옴표 보존(마크업 불필요)', () => {
    const [el] = renderInline('"만지면 안 됐어."') as El[];
    expect(el.type).toBe("span");
    expect(el.props.className).toContain("amber");
    expect(el.props.children).toBe('"만지면 안 됐어."');
  });

  it("[[고유명사]] → 청록 span, 괄호 제거", () => {
    const [el] = renderInline("[[옴팔로스 정거장]]") as El[];
    expect(el.type).toBe("span");
    expect(el.props.className).toContain("teal");
    expect(el.props.children).toBe("옴팔로스 정거장");
  });

  it("혼합 문장 — 희곡체 한 줄", () => {
    const nodes = renderInline('**밀수꾼** *(떨며)* "그건 [[사제단]]의 것이오."');
    // strong, 공백, em, 공백, 대사 span("그건 " 포함)… 대사 안 [[]] 는 대사 토큰이 먼저 먹는다
    const types = nodes.map((n) => (typeof n === "string" ? "text" : (n as El).type));
    expect(types[0]).toBe("strong");
    expect(types).toContain("em");
    expect(types).toContain("span");
  });

  it("단일 [대괄호] 라벨 프리픽스는 건드리지 않는다", () => {
    const nodes = renderInline("[완력] 뚜껑을 닫는다");
    expect(nodes).toEqual(["[완력] 뚜껑을 닫는다"]);
  });

  it("따옴표가 줄을 넘으면 매치하지 않는다", () => {
    const nodes = renderInline('열린 따옴표 "만');
    expect(nodes).toEqual(['열린 따옴표 "만']);
  });
});
