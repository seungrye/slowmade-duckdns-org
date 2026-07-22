// PostItem — 비공개 글은 목록 제목 앞에 자물쇠(홈·태그·대시보드 공용).
// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PostItem from "./post-item";
import type { GetPostType } from "@/types/posts.d";

const base = {
  _id: "1",
  title: "샘플 글",
  jsonContent: { type: "doc", content: [] },
  likes: 0,
  views: 0,
  commentCount: 0,
  tags: [],
  userEmail: "a@b.c",
  author: "A",
} as unknown as GetPostType;

describe("PostItem 비공개 자물쇠", () => {
  it("isPrivate=true → 제목 앞 자물쇠 표시", () => {
    render(<PostItem post={{ ...base, isPrivate: true }} isOpen={false} togglePost={() => {}} />);
    expect(screen.getByRole("img", { name: "비공개" })).toBeInTheDocument();
  });

  it("isPrivate=false → 자물쇠 없음", () => {
    render(<PostItem post={{ ...base, isPrivate: false }} isOpen={false} togglePost={() => {}} />);
    expect(screen.queryByRole("img", { name: "비공개" })).not.toBeInTheDocument();
  });
});
