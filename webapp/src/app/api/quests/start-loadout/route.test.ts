import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({ connectToDB: vi.fn() }));

// findById 는 .lean() 체인을 호출하기도, 직접 await 되기도 함.
// PUT 은 mongoose Document save() 를 사용 → 그것까지 mock.
const findByIdMock = vi.fn();
const createMock = vi.fn();
vi.mock("@/models/start-loadout", () => ({
  default: {
    findById: (...args: unknown[]) => findByIdMock(...args),
    create: (...args: unknown[]) => createMock(...args),
  },
}));

import { GET, PUT } from "./route";

function makeRequest(body?: object): NextRequest {
  return new Request("http://localhost/api/quests/start-loadout", {
    method: body ? "PUT" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

function leanResolve(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

describe("GET /api/quests/start-loadout", () => {
  beforeEach(() => {
    findByIdMock.mockReset();
    createMock.mockReset();
  });

  it("doc 없으면 기본값(gold 50) 을 반환", async () => {
    findByIdMock.mockReturnValue(leanResolve(null));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({
      _id: "default",
      gold: 50,
      weapon: null,
      armor: null,
      items: [],
      consumables: [],
    });
  });

  it("doc 있으면 그대로 반환", async () => {
    const doc = {
      _id: "default", gold: 100, weapon: "sword", armor: null,
      items: ["bow"], consumables: [{ id: "p", count: 1 }], version: 3,
    };
    findByIdMock.mockReturnValue(leanResolve(doc));
    const res = await GET();
    const body = await res.json();
    expect(body.data).toEqual(doc);
  });
});

describe("PUT /api/quests/start-loadout", () => {
  beforeEach(() => {
    findByIdMock.mockReset();
    createMock.mockReset();
  });

  it("검증 실패 → 400", async () => {
    const res = await PUT(makeRequest({ gold: -1, items: [], consumables: [] }));
    expect(res.status).toBe(400);
  });

  it("doc 없으면 create 호출 (201)", async () => {
    findByIdMock.mockResolvedValue(null);
    createMock.mockResolvedValue({ _id: "default", gold: 42, version: 1 });
    const res = await PUT(makeRequest({
      gold: 42, weapon: null, armor: null, items: ["sword"],
      consumables: [{ id: "p", count: 2 }],
    }));
    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      _id: "default", gold: 42, items: ["sword"],
    }));
  });

  it("doc 있으면 save() 로 갱신 + version 증가", async () => {
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const existing = {
      _id: "default", gold: 1, weapon: null, armor: null,
      items: [], consumables: [], version: 2, save: saveMock,
    };
    findByIdMock.mockResolvedValue(existing);
    const res = await PUT(makeRequest({
      gold: 99, weapon: "sword", armor: null,
      items: ["bow"], consumables: [{ id: "p", count: 5 }],
    }));
    expect(res.status).toBe(200);
    expect(existing.gold).toBe(99);
    expect(existing.version).toBe(3);
    expect(saveMock).toHaveBeenCalled();
  });
});
