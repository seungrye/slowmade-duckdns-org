import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// env 목킹: geminiApiKey 빈값(suggestTags 폴백 검증), revalidateToken 은 테스트별로 바꾼다.
// vi.hoisted 로 올려 mock 팩토리(호이스팅됨)가 참조 가능하게 한다.
const mockEnv = vi.hoisted(() => ({ geminiApiKey: "", siteUrl: "http://localhost", revalidateToken: "secret" }));
vi.mock("@/lib/env", () => ({ env: mockEnv }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class {} }));
vi.mock("@/models/post", () => ({ default: {} }));
vi.mock("@/lib/db", () => ({ connectToDB: vi.fn() }));
vi.mock("@/lib/posts", () => ({ getAllTags: vi.fn(async () => []) }));

import { pickAiTags, suggestTags, triggerRevalidate } from "./suggest-tags";

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

describe("triggerRevalidate — 내부 엔드포인트 self-fetch", () => {
  beforeEach(() => {
    mockEnv.revalidateToken = "secret";
    vi.restoreAllMocks();
  });

  it("토큰 있으면 /api/revalidate 로 올바른 헤더·body(paths) 1회 POST", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await triggerRevalidate(["/post/view/abc123", "/tags"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opt] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost/api/revalidate");
    expect(opt.method).toBe("POST");
    expect((opt.headers as Record<string, string>)["x-internal-token"]).toBe("secret");
    expect(JSON.parse(opt.body as string)).toEqual({ paths: ["/post/view/abc123", "/tags"] });
  });

  it("토큰 없으면 fetch 미호출(skip)", async () => {
    mockEnv.revalidateToken = "";
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await triggerRevalidate(["/tags"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("빈 paths 면 fetch 미호출", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await triggerRevalidate([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetch 실패해도 throw 하지 않음", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("network"); });
    vi.stubGlobal("fetch", fetchMock);
    await expect(triggerRevalidate(["/tags"])).resolves.toBeUndefined();
  });
});
