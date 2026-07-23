// TagInput — 한글 IME/콤마 태그 입력 (끝 글자 남는 버그 회귀 방지).
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TagInput from "./tag-input.section";

beforeEach(() => {
  // 마운트 시 /api/tags 조회 — 빈 목록으로 목킹(제안은 테스트 대상 아님).
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })));
});
afterEach(() => vi.unstubAllGlobals());

describe("TagInput — 콤마/한글 IME", () => {
  it("콤마 입력 시 앞 조각을 태그로 추가하고 나머지만 입력값으로 남긴다", () => {
    const onTagsChange = vi.fn();
    render(<TagInput tags={[]} onTagsChange={onTagsChange} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "우리집," } });
    expect(onTagsChange).toHaveBeenCalledWith(["우리집"]);
    expect(input.value).toBe(""); // 끝 글자('집')가 남지 않는다
  });

  it("IME 조합 중 Enter 는 태그를 추가하지 않는다(조합 확정용)", () => {
    const onTagsChange = vi.fn();
    render(<TagInput tags={[]} onTagsChange={onTagsChange} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "우리집" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onTagsChange).not.toHaveBeenCalled();
  });

  it("조합이 아닌 Enter 는 태그를 추가한다", () => {
    const onTagsChange = vi.fn();
    render(<TagInput tags={[]} onTagsChange={onTagsChange} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "우리집" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onTagsChange).toHaveBeenCalledWith(["우리집"]);
  });

  it("콤마 다중(a,b,c) → a·b 추가하고 c 를 남긴다", () => {
    const onTagsChange = vi.fn();
    render(<TagInput tags={[]} onTagsChange={onTagsChange} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "a,b,c" } });
    expect(onTagsChange).toHaveBeenCalledWith(["a", "b"]);
    expect(input.value).toBe("c");
  });
});
