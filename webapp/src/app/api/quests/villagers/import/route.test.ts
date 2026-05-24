import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/villager', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock('@/models/villager-revision', () => ({
  default: {
    create: vi.fn(),
  },
}));

import { POST } from './route';
import Villager from '@/models/villager';
import VillagerRevision from '@/models/villager-revision';

function makeRequest(body: string): NextRequest {
  return new Request('http://localhost/api/villagers/import', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body,
  }) as unknown as NextRequest;
}

const SIMPLE_RON = `[
    VillagerDef(
        id: "elder",
        name: "장로",
        color: (0.9, 0.8, 0.5),
        dialogs: [],
        speed: 0.5,
    ),
    VillagerDef(
        id: "burgomaster",
        name: "촌장",
        color: (1.0, 0.85, 0.0),
        dialogs: ["안녕"],
        speed: 1.0,
    ),
]`;

describe('POST /api/villagers/import', () => {
  beforeEach(() => vi.clearAllMocks());

  it('잘못된 RON 이면 400', async () => {
    const res = await POST(makeRequest('garbage(((('));
    expect(res.status).toBe(400);
  });

  it('color 가 [0~1]³ 이 아니면 400 + 해당 villager id 명시', async () => {
    const bad = `[VillagerDef(id: "x", name: "엑스", color: (2.0, 0.0, 0.0), dialogs: [], speed: 1.0)]`;
    const res = await POST(makeRequest(bad));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('x');
  });

  it('구 형식(quest_id 포함) 도 파싱되지만 id 없으면 400', async () => {
    const old = `[VillagerDef(name: "장로", color: (0.9, 0.8, 0.5), dialogs: [], quest_id: None, speed: 0.5)]`;
    const res = await POST(makeRequest(old));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('id');
  });

  it('신규는 create, 기존은 revision 백업 + version + 1 + save', async () => {
    // elder 존재, burgomaster 없음
    const elder = {
      _id: 'v1',
      id: 'elder', name: '장로', color: [0.9, 0.8, 0.5], dialogs: ['old'],
      speed: 1.0, version: 2,
      save: vi.fn().mockResolvedValue(undefined),
    };
    (Villager.findOne as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(elder)   // elder
      .mockResolvedValueOnce(null);   // burgomaster
    (Villager.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (VillagerRevision.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await POST(makeRequest(SIMPLE_RON));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ created: 1, updated: 1 });

    // elder: revision 백업 (이전 v2 + dialogs:['old']) → 갱신
    expect(VillagerRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      villagerId: 'v1',
      version: 2,
      villager: expect.objectContaining({ id: 'elder', dialogs: ['old'] }),
    }));
    expect(elder.dialogs).toEqual([]);
    expect(elder.version).toBe(3);
    expect(elder.save).toHaveBeenCalled();

    // burgomaster: 신규 생성 — revision 백업 없음 (call count 1, elder용만)
    expect(VillagerRevision.create).toHaveBeenCalledTimes(1);
    expect(Villager.create).toHaveBeenCalledWith(expect.objectContaining({
      id: 'burgomaster', name: '촌장', dialogs: ['안녕'],
    }));
  });

  it('빈 배열 import 는 created=0, updated=0', async () => {
    const res = await POST(makeRequest('[]'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ created: 0, updated: 0 });
  });
});
