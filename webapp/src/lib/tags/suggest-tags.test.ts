import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// env 목킹: geminiApiKey 빈값(suggestTags 폴백 검증), revalidateToken 은 테스트별로 바꾼다.
// vi.hoisted 로 올려 mock 팩토리(호이스팅됨)가 참조 가능하게 한다.
const mockEnv = vi.hoisted(() => ({ geminiApiKey: "", siteUrl: "http://localhost", revalidateToken: "secret" }));
vi.mock("@/lib/env", () => ({ env: mockEnv }));
// 이미지 태깅(#234) 검증을 위해 실제 호출을 붙잡는다.
const mockGenerateContent = vi.hoisted(() => vi.fn());
vi.mock("@google/genai", () => ({
  GoogleGenAI: class { models = { generateContent: mockGenerateContent }; },
}));
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

// 이미지도 보는 자동 태깅 (#234).
//
// 이 사이트는 글 172건 중 48건이 이미지를 갖고 있고, 유머 글은 이미지가 내용의 전부인
// 경우도 많다. 실측: 제목이 "연산자 우선순위"인 글의 이미지만 주니 ["수학문제","산수","퀴즈"]
// 가 나왔다 — 텍스트만으로는 나올 수 없는 태그다.
describe("suggestTags — 이미지까지 보기", () => {
  function okImage(bytes = 100, type = "image/webp") {
    return {
      ok: true,
      headers: { get: () => type },
      arrayBuffer: async () => new ArrayBuffer(bytes),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.geminiApiKey = "test-key";
    mockGenerateContent.mockResolvedValue({ text: '["태그1","태그2"]' });
    vi.stubGlobal("fetch", vi.fn(async () => okImage()));
  });
  afterEach(() => vi.unstubAllGlobals());

  /** 호출된 모델 이름 순서 */
  const models = () => mockGenerateContent.mock.calls.map((c) => c[0].model);
  /** 첫 호출의 parts */
  function parts(): Array<Record<string, unknown>> {
    const contents = mockGenerateContent.mock.calls[0][0].contents;
    return contents[0].parts;
  }

  it("이미지가 없으면 기존 체인(gemma 먼저)을 쓴다", async () => {
    await suggestTags({ title: "t", htmlContent: "<p>본문</p>", allTags: [], userTags: [] });
    expect(models()[0]).toBe("gemma-4-31b-it");
  });

  // Gemma 는 이미지가 붙으면 한국어 지시를 무시하고 영어로 답한다(실측).
  it("이미지가 있으면 Gemini 를 먼저 쓴다", async () => {
    await suggestTags({
      title: "t", htmlContent: "<p>본문</p>", allTags: [], userTags: [],
      imageUrls: [{ url: "https://x.test/a.webp", thumbnailUrl: "https://x.test/a-t.webp" }],
    });
    expect(models()[0]).toContain("gemini");
  });

  it("이미지를 inlineData 파트로 싣는다", async () => {
    await suggestTags({
      title: "t", htmlContent: "<p>본문</p>", allTags: [], userTags: [],
      imageUrls: [{ url: "https://x.test/a.webp" }],
    });
    const inline = parts().filter((p) => "inlineData" in p);
    expect(inline).toHaveLength(1);
    expect((inline[0].inlineData as { mimeType: string }).mimeType).toBe("image/webp");
  });

  // 이미지를 못 받는다고 태깅이 죽으면 안 된다 — 이 파일의 기존 원칙이다.
  it("이미지를 못 받아도 텍스트로 태깅을 끝낸다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    const tags = await suggestTags({
      title: "t", htmlContent: "<p>본문</p>", allTags: [], userTags: [],
      imageUrls: [{ url: "https://x.test/a.webp" }],
    });
    expect(tags).toEqual(["태그1", "태그2"]);
    expect(parts().filter((p) => "inlineData" in p)).toHaveLength(0);
    // 이미지가 없는 셈이므로 기존 체인으로 돌아간다.
    expect(models()[0]).toBe("gemma-4-31b-it");
  });

  it("이미지는 최대 2장만 보낸다", async () => {
    await suggestTags({
      title: "t", htmlContent: "<p>본문</p>", allTags: [], userTags: [],
      imageUrls: [1, 2, 3, 4].map((i) => ({ url: `https://x.test/${i}.webp` })),
    });
    expect(parts().filter((p) => "inlineData" in p)).toHaveLength(2);
  });

  // 아주 큰 원본은 인라인으로 못 싣는다 — 그때만 축소본으로 내려간다.
  it("원본이 상한을 넘으면 썸네일로 내려간다", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      seen.push(u);
      return u.includes("-t.") ? okImage(100) : okImage(5 * 1024 * 1024);
    }));
    await suggestTags({
      title: "t", htmlContent: "<p>본문</p>", allTags: [], userTags: [],
      imageUrls: [{ url: "https://x.test/a.webp", thumbnailUrl: "https://x.test/a-t.webp" }],
    });
    expect(seen).toEqual(["https://x.test/a.webp", "https://x.test/a-t.webp"]);
    expect(parts().filter((p) => "inlineData" in p)).toHaveLength(1);
  });
});
