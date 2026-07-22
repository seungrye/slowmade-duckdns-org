import { describe, it, expect } from "vitest";
import { privacyMatch } from "../posts";

describe("privacyMatch — 비공개 글 열람 필터", () => {
  it("비로그인(뷰어 없음): 공개 글만", () => {
    expect(privacyMatch(null)).toEqual({ isPrivate: { $ne: true } });
    expect(privacyMatch(undefined)).toEqual({ isPrivate: { $ne: true } });
    expect(privacyMatch("")).toEqual({ isPrivate: { $ne: true } }); // falsy → 공개만
  });

  it("로그인: 공개 글 ∪ 본인(userEmail)의 비공개 글", () => {
    expect(privacyMatch("me@x.com")).toEqual({
      $or: [{ isPrivate: { $ne: true } }, { userEmail: "me@x.com" }],
    });
  });
});
