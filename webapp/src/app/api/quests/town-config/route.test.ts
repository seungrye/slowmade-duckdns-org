import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({ connectToDB: vi.fn() }));

const findByIdMock = vi.fn();
const createMock = vi.fn();
vi.mock("@/models/town-config", () => ({
  default: {
    findById: (...args: unknown[]) => findByIdMock(...args),
    create: (...args: unknown[]) => createMock(...args),
  },
}));

import { GET, PUT } from "./route";

function makeRequest(body?: object): NextRequest {
  return new Request("http://localhost/api/quests/town-config", {
    method: body ? "PUT" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

function leanResolve(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

const VALID_BODY = {
  size: "village",
  roads: "radial",
  wealth: "common",
  defenses: "none",
  landmarks: ["inn", "smithy"],
  fields: true,
};

describe("GET /api/quests/town-config", () => {
  beforeEach(() => {
    findByIdMock.mockReset();
    createMock.mockReset();
  });

  it("doc 없으면 기본값(Village/Radial/Common/None/[Inn,Smithy]/fields=true) 반환", async () => {
    findByIdMock.mockReturnValue(leanResolve(null));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({
      _id: "default",
      size: "village",
      roads: "radial",
      wealth: "common",
      defenses: "none",
      landmarks: ["inn", "smithy"],
      fields: true,
      version: 0,
    });
  });

  it("doc 있으면 그대로 반환", async () => {
    const doc = {
      _id: "default",
      size: "town",
      roads: "linear",
      wealth: "wealthy",
      defenses: "stone",
      landmarks: ["temple", "market", "manor"],
      fields: false,
      version: 5,
    };
    findByIdMock.mockReturnValue(leanResolve(doc));
    const res = await GET();
    const body = await res.json();
    expect(body.data).toEqual(doc);
  });
});

describe("PUT /api/quests/town-config", () => {
  beforeEach(() => {
    findByIdMock.mockReset();
    createMock.mockReset();
  });

  it("size 가 잘못된 값이면 400", async () => {
    const res = await PUT(makeRequest({ ...VALID_BODY, size: "megacity" }));
    expect(res.status).toBe(400);
  });

  it("landmarks 에 알 수 없는 값이면 400", async () => {
    const res = await PUT(makeRequest({ ...VALID_BODY, landmarks: ["inn", "unknown"] }));
    expect(res.status).toBe(400);
  });

  it("landmarks 에 중복 값이면 400", async () => {
    const res = await PUT(makeRequest({ ...VALID_BODY, landmarks: ["inn", "inn"] }));
    expect(res.status).toBe(400);
  });

  it("fields 가 boolean 이 아니면 400", async () => {
    const res = await PUT(makeRequest({ ...VALID_BODY, fields: "yes" }));
    expect(res.status).toBe(400);
  });

  it("doc 없으면 create 호출 (201)", async () => {
    findByIdMock.mockResolvedValue(null);
    createMock.mockResolvedValue({ _id: "default", ...VALID_BODY, version: 1 });
    const res = await PUT(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      _id: "default",
      size: "village",
      roads: "radial",
      fields: true,
    }));
  });

  it("doc 있으면 save() 로 갱신 + version 증가", async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const existing = {
      _id: "default",
      size: "village", roads: "radial", wealth: "common", defenses: "none",
      landmarks: ["inn"], fields: true, version: 2, save: saveMock,
    };
    findByIdMock.mockResolvedValue(existing);
    const res = await PUT(makeRequest({
      size: "town", roads: "random", wealth: "wealthy", defenses: "stone",
      landmarks: ["inn", "smithy", "manor"], fields: false,
    }));
    expect(res.status).toBe(200);
    expect(existing.size).toBe("town");
    expect(existing.wealth).toBe("wealthy");
    expect(existing.fields).toBe(false);
    expect(existing.landmarks).toEqual(["inn", "smithy", "manor"]);
    expect(existing.version).toBe(3);
    expect(saveMock).toHaveBeenCalled();
  });
});
