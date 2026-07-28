import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// env 토큰='secret' 로 목킹, next/cache.revalidatePath 목.
vi.mock("@/lib/env", () => ({ env: { revalidateToken: "secret" } }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import { POST } from "./route";

function post(body: unknown, token?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== undefined) headers["x-internal-token"] = token;
  return new NextRequest("http://localhost/api/revalidate", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/revalidate — 내부 self-call 캐시 무효화", () => {
  beforeEach(() => revalidatePath.mockClear());

  it("토큰 헤더 없으면 404, revalidatePath 미호출", async () => {
    const res = await POST(post({ paths: ["/tags"] }));
    expect(res.status).toBe(404);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("잘못된 토큰이면 404", async () => {
    const res = await POST(post({ paths: ["/tags"] }, "wrong"));
    expect(res.status).toBe(404);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("정토큰 + 허용 경로 → 200, 경로별 revalidatePath 호출", async () => {
    const res = await POST(post({ paths: ["/post/view/6a68764ec0a628006da28ef1", "/tags"] }, "secret"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.revalidated).toEqual(["/post/view/6a68764ec0a628006da28ef1", "/tags"]);
    expect(revalidatePath).toHaveBeenCalledWith("/post/view/6a68764ec0a628006da28ef1");
    expect(revalidatePath).toHaveBeenCalledWith("/tags");
  });

  it("허용 안 된 경로('/')는 스킵(무효화 안 함)", async () => {
    const res = await POST(post({ paths: ["/", "/etc/passwd", "/tags"] }, "secret"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.revalidated).toEqual(["/tags"]);
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/tags");
  });

  it("paths 없거나 배열 아니면 200 + 빈 결과(방어)", async () => {
    const res = await POST(post({}, "secret"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.revalidated).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
