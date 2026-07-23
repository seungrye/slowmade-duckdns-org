import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// env.geminiApiKey 를 비워 suggestTags 의 '키 없음 → []' 를 검증할 수 있게 목킹.
// (pickAiTags 는 순수라 목 불필요.)
vi.mock("@/lib/env", () => ({ env: { geminiApiKey: "", siteUrl: "http://localhost" } }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class {} }));
vi.mock("@/models/post", () => ({ default: {} }));
vi.mock("@/lib/db", () => ({ connectToDB: vi.fn() }));
vi.mock("@/lib/posts", () => ({ getAllTags: vi.fn(async () => []) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { pickAiTags, suggestTags } from "./suggest-tags";

describe("pickAiTags — Gemini 응답 → 태그 배열", () => {
  it("JSON 배열 파싱 + 사용자중복 제외(사람 우선) + dedup", () => {
    expect(pickAiTags('["여행","맛집","서울","여행"]', ["맛집"])).toEqual(["여행", "서울"]);
  });

  it("코드펜스·설명이 섞여도 배열만 추출", () => {
    expect(pickAiTags("추천: ```json\n[\"a\",\"b\"]\n```", [])).toEqual(["a", "b"]);
  });

  it("# 접두·양끝 따옴표·공백 정제", () => {
    expect(pickAiTags('["#태그", "  공백  ", "\\"인용\\""]', [])).toEqual(["태그", "공백", "인용"]);
  });

  it("JSON 실패 시 콤마 분리 폴백", () => {
    expect(pickAiTags("여행, 맛집, 서울", [])).toEqual(["여행", "맛집", "서울"]);
  });

  it("cap 개수 제한", () => {
    expect(pickAiTags('["a","b","c","d","e","f"]', [], 3)).toEqual(["a", "b", "c"]);
  });

  it("빈/공백 항목 제외", () => {
    expect(pickAiTags('["", "  ", "유효"]', [])).toEqual(["유효"]);
  });

  it("사용자중복은 대소문자 무시", () => {
    expect(pickAiTags('["Travel","food"]', ["FOOD"])).toEqual(["Travel"]);
  });
});

describe("suggestTags — 키 없음 안전 폴백", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("GEMINI 키 없으면 Gemini 호출 없이 [] 반환", async () => {
    const r = await suggestTags({ title: "t", htmlContent: "<p>본문</p>", allTags: [], userTags: [] });
    expect(r).toEqual([]);
  });
});
