import { describe, it, expect } from "vitest";
import { truncate } from "./truncate";

describe("truncate — 줄 정리", () => {
  it("줄바꿈은 공백 하나로 바뀌고 앞뒤 공백은 제거된다", () => {
    expect(truncate("  안녕하세요.\n반갑습니다.  ", 100)).toBe("안녕하세요. 반갑습니다.");
  });

  it("여러 줄도 한 줄 발췌가 된다", () => {
    expect(truncate("첫줄\n둘째줄\n셋째줄", 100)).toBe("첫줄 둘째줄 셋째줄");
  });
});

describe("truncate — 길이 제한", () => {
  it("정리된 문자열이 max 이하면 그대로 반환한다", () => {
    expect(truncate("짧은 덧글", 10)).toBe("짧은 덧글");
  });

  it("정리된 길이가 max 와 같으면 잘리지 않는다", () => {
    const text = "abcde";
    expect(truncate(text, 5)).toBe(text);
  });

  it("max 를 넘으면 max 글자 + 말줄임(…) 로 총 max+1 글자가 된다", () => {
    const result = truncate("가나다라마바사아자차", 5);
    expect(result).toBe("가나다라마…");
    expect(result.length).toBe(6);
  });

  it("말줄임 문자는 U+2026 이다", () => {
    const result = truncate("hello world", 5);
    expect(result.endsWith("\u2026")).toBe(true);
  });
});

describe("truncate — max 예외 처리", () => {
  it.each([0, -1])("max 가 %i 이하면 빈 문자열을 반환한다", (max) => {
    expect(truncate("아무 내용", max)).toBe("");
  });
});
