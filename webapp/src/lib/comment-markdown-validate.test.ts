import { describe, it, expect } from "vitest";
import { validateCommentMarkdown } from "./comment-markdown-validate";

describe("validateCommentMarkdown", () => {
  it("정상 텍스트 → null", () => {
    expect(validateCommentMarkdown("안녕하세요 반갑습니다")).toBeNull();
  });

  it("완성된 링크 → null", () => {
    expect(validateCommentMarkdown("여기 [구글](https://google.com) 참고")).toBeNull();
  });

  it("완성된 이미지 → null", () => {
    expect(validateCommentMarkdown("![고양이](https://x.com/c.png)")).toBeNull();
  });

  it("raw URL(마크다운 아님) → null", () => {
    expect(validateCommentMarkdown("https://example.com 보세요")).toBeNull();
  });

  it("곱셈/강조 * 는 오탐 없이 통과", () => {
    expect(validateCommentMarkdown("2 * 3 = 6 그리고 *강조*")).toBeNull();
  });

  it("닫히지 않은 코드 블록 → 에러", () => {
    const e = validateCommentMarkdown("```js\nconst a = 1;");
    expect(e).toContain("코드 블록");
  });

  it("짝 맞는 코드 블록 → null", () => {
    expect(validateCommentMarkdown("```js\nconst a = 1;\n```")).toBeNull();
  });

  it("닫히지 않은 인라인 코드 → 에러", () => {
    expect(validateCommentMarkdown("이건 `code 입니다")).toContain("인라인 코드");
  });

  it("깨진 링크 ]( 뒤 ) 없음 → 에러", () => {
    expect(validateCommentMarkdown("[구글](https://google.com 보세요")).toContain("링크 문법");
  });

  it("대괄호만 있는 일반 텍스트 [중요] → null (링크 시도 아님)", () => {
    expect(validateCommentMarkdown("[중요] 공지입니다")).toBeNull();
  });

  it("코드펜스 안의 백틱은 무시", () => {
    expect(validateCommentMarkdown("```\na ` b ` c\n```")).toBeNull();
  });
});
