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

/** Sends the order (LOC, behind the dry-run gate) and records it. Isolated per order, so one failure blocks neither the rest nor the state save. */
//
// **JavaScript strings are UTF-16 code units.** Cutting through the middle of a character that takes two units,
// like an emoji, leaves half of it and shows a broken glyph. The notification excerpt calls this with 200, so if
// the 200th landed mid-emoji it went out live like that.
//
// The old tests reached the numeric boundaries (0, -1, equal lengths) and **stopped there.**
describe("truncate — 사람이 보는 글자 단위로 자른다", () => {
  /** Whether a lone surrogate half is left - what shows as a broken glyph. */
  const 깨졌나 = (s: string) =>
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

  it("이모지를 반으로 가르지 않는다", () => {
    const 글 = "가".repeat(199) + "👍끝";
    expect(깨졌나(truncate(글, 200))).toBe(false);
  });

  it("이모지 하나를 한 글자로 센다", () => {
    // Taking two units each, only 3 fit. To a person that is 5 characters.
    expect(truncate("👍👍👍👍👍", 5)).toBe("👍👍👍👍👍");
  });

  it("이모지가 넘치면 자르고 말줄임표", () => {
    expect(truncate("👍👍👍👍👍👍", 5)).toBe("👍👍👍👍👍…");
  });

  // A family emoji is several characters joined by ZWJs. Cutting the middle scatters the pieces.
  it("결합 이모지를 쪼개지 않는다", () => {
    const 가족 = "👨‍👩‍👧";
    expect(truncate(`${가족}뒤`, 1)).toBe(`${가족}…`);
  });

  it("한글은 종전처럼 한 글자씩", () => {
    expect(truncate("가나다라마", 3)).toBe("가나다…");
  });

  it("자를 필요가 없으면 말줄임표를 안 붙인다", () => {
    expect(truncate("👍👍", 5)).toBe("👍👍");
  });
});
