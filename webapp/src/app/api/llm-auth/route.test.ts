import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { ownerEmail: "admin@example.com", llmKey: "secret-llm-key" } }));

import { GET } from "./route";
import { auth } from "@/auth";
import { NextRequest } from "next/server";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
function req(headers: Record<string, string> = {}): NextRequest {
  return new Request("http://localhost/api/llm-auth", { headers }) as NextRequest;
}

describe("GET /api/llm-auth (nginx auth_request 게이트)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("관리자 세션이면 200", async () => {
    mockAuth.mockResolvedValue({ user: { email: "admin@example.com" } });
    expect((await GET(req())).status).toBe(200);
  });

  it("Bearer LLM 키면 200(세션 없어도)", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET(req({ Authorization: "Bearer secret-llm-key" }))).status).toBe(200);
  });

  it("무자격(세션·키 없음)이면 401", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
  });

  it("비관리자 세션 + 무키 → 401", async () => {
    mockAuth.mockResolvedValue({ user: { email: "other@example.com" } });
    expect((await GET(req())).status).toBe(401);
  });

  it("틀린 키 → 401", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET(req({ Authorization: "Bearer wrong" }))).status).toBe(401);
  });
});
