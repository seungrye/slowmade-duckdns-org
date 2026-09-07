import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mocking env: geminiApiKey is empty (to verify suggestTags' fallback), and revalidateToken varies per test.
// Hoisted with vi.hoisted so the (hoisted) mock factory can reference it.
const mockEnv = vi.hoisted(() => ({ geminiApiKey: "", siteUrl: "http://localhost", revalidateToken: "secret" }));
vi.mock("@/lib/env", () => ({ env: mockEnv }));
// Captures the real calls in order to verify image tagging (#234).
const mockGenerateContent = vi.hoisted(() => vi.fn());
vi.mock("@google/genai", () => ({
  GoogleGenAI: class { models = { generateContent: mockGenerateContent }; },
}));
vi.mock("@/models/post", () => ({ default: {} }));
vi.mock("@/lib/db", () => ({ connectToDB: vi.fn() }));
vi.mock("@/lib/posts", () => ({ getAllTags: vi.fn(async () => []) }));

import {
  pickAiTags,
  suggestTags,
  triggerRevalidate,
  fitTagsToBudget,
  TAG_LIST_CHAR_BUDGET,
} from "./suggest-tags";

// How much of the existing tag list to show the model (#251).
//
// It used to be `allTags.slice(0, 200)`. With 396 distinct tags across public posts, **196 were never seen by the
// model at all**, and with no $sort in __getAllTags the 196 cut off were not "the less-used ones" but arbitrary.
// A relevant tag on the invisible side cannot be reused however much you want to.
//
// All 396 come to 3,336 characters (measured) - there is no reason to cut. The budget is only a safeguard for when
// tags grow into the thousands, and when it does cut, **the least-used go first**.
describe("fitTagsToBudget — 프롬프트에 실을 기존 태그", () => {
  const t = (tag: string, count: number) => ({ tag, count });

  it("예산 안이면 하나도 안 버린다 — 지금 규모(396개·3.3천자)가 여기 해당한다", () => {
    const many = Array.from({ length: 396 }, (_, i) => t(`태그${i}`, 1));
    expect(fitTagsToBudget(many)).toHaveLength(396);
  });

  it("많이 쓰인 것부터 싣는다", () => {
    expect(fitTagsToBudget([t("드묾", 1), t("흔함", 9), t("보통", 5)]))
      .toEqual(["흔함", "보통", "드묾"]);
  });

  it("예산을 넘으면 적게 쓰인 것부터 버린다", () => {
    expect(fitTagsToBudget([t("aaaa", 9), t("bbbb", 5), t("cccc", 1)], 10))
      .toEqual(["aaaa", "bbbb"]); // "aaaa, bbbb" = 10 characters
  });

  it("구분자까지 세어 예산을 지킨다 — 넘겨 놓고 잘리면 의미가 없다", () => {
    expect(fitTagsToBudget([t("aaaa", 9), t("bbbb", 5)], 9)).toEqual(["aaaa"]);
  });

  it("빈 목록은 빈 결과", () => {
    expect(fitTagsToBudget([])).toEqual([]);
  });

  it("첫 태그 하나도 예산을 넘으면 빈 결과 — 반쪽 태그를 싣지 않는다", () => {
    expect(fitTagsToBudget([t("아주긴태그", 9)], 3)).toEqual([]);
  });

  it("사용 횟수가 같으면 순서가 흔들리지 않는다", () => {
    const a = fitTagsToBudget([t("나", 3), t("가", 3), t("다", 3)]);
    const b = fitTagsToBudget([t("다", 3), t("가", 3), t("나", 3)]);
    expect(a).toEqual(b);
  });

  it("기본 예산은 지금 태그 전체(3,336자)보다 넉넉하다", () => {
    expect(TAG_LIST_CHAR_BUDGET).toBeGreaterThan(3336);
  });
});

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

// Automatic tagging that also looks at images (#234).
//
// On this site 48 of 172 posts have images, and for humour posts the image is often the whole content.
// Measured: giving only the image of a post titled "operator precedence" produced ["수학문제", "산수", "퀴즈"] -
// tags the text alone could never have produced.
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

  /** the order of the model names called */
  const models = () => mockGenerateContent.mock.calls.map((c) => c[0].model);
  /** the first call's parts */
  function parts(): Array<Record<string, unknown>> {
    const contents = mockGenerateContent.mock.calls[0][0].contents;
    return contents[0].parts;
  }

  it("이미지가 없으면 기존 체인(gemma 먼저)을 쓴다", async () => {
    await suggestTags({ title: "t", htmlContent: "<p>본문</p>", allTags: [], userTags: [] });
    expect(models()[0]).toBe("gemma-4-31b-it");
  });

  // With an image attached, Gemma ignores Korean instructions and answers in English (measured).
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

  // Tagging must not die because the image cannot be fetched - the existing principle of this file.
  it("이미지를 못 받아도 텍스트로 태깅을 끝낸다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    const tags = await suggestTags({
      title: "t", htmlContent: "<p>본문</p>", allTags: [], userTags: [],
      imageUrls: [{ url: "https://x.test/a.webp" }],
    });
    expect(tags).toEqual(["태그1", "태그2"]);
    expect(parts().filter((p) => "inlineData" in p)).toHaveLength(0);
    // It is effectively imageless, so it falls back to the existing chain.
    expect(models()[0]).toBe("gemma-4-31b-it");
  });

  // #251 - fixed the 200-item cap that hid half the tags from the model.
  it("기존 태그를 잘라내지 않고 전부 프롬프트에 싣는다", async () => {
    const allTags = Array.from({ length: 396 }, (_, i) => ({ tag: `태그${i}`, count: 1 }));
    await suggestTags({ title: "t", htmlContent: "<p>본문</p>", allTags, userTags: [] });
    const text = (parts()[0] as { text: string }).text;
    expect(text).toContain("태그0");
    expect(text).toContain("태그395"); // everything past the 200th used to be dropped wholesale
  });

  it("많이 쓰인 태그를 앞에 싣는다", async () => {
    await suggestTags({
      title: "t", htmlContent: "<p>본문</p>", userTags: [],
      allTags: [{ tag: "드묾", count: 1 }, { tag: "흔함", count: 9 }],
    });
    const text = (parts()[0] as { text: string }).text;
    expect(text.indexOf("흔함")).toBeLessThan(text.indexOf("드묾"));
  });

  it("이미지는 최대 2장만 보낸다", async () => {
    await suggestTags({
      title: "t", htmlContent: "<p>본문</p>", allTags: [], userTags: [],
      imageUrls: [1, 2, 3, 4].map((i) => ({ url: `https://x.test/${i}.webp` })),
    });
    expect(parts().filter((p) => "inlineData" in p)).toHaveLength(2);
  });

  // A very large original cannot be sent inline - only then does it fall back to the reduced version.
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
