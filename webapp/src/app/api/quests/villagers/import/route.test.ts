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
        name: "장로",
        color: (0.9, 0.8, 0.5),
        dialogs: [],
        quest_id: Some("gem_quest"),
        speed: 0.5,
    ),
    VillagerDef(
        name: "촌장",
        color: (1.0, 0.85, 0.0),
        dialogs: ["안녕"],
        quest_id: None,
        speed: 1.0,
    ),
]`;

describe('POST /api/villagers/import', () => {
  beforeEach(() => vi.clearAllMocks());

  it('잘못된 RON 이면 400', async () => {
    const res = await POST(makeRequest('garbage(((('));
    expect(res.status).toBe(400);
  });

  it('color 가 [0~1]³ 이 아니면 400 + 해당 villager name 명시', async () => {
    const bad = `[VillagerDef(name: "x", color: (2.0, 0.0, 0.0), dialogs: [], quest_id: None, speed: 1.0)]`;
    const res = await POST(makeRequest(bad));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('x');
  });

  it('신규는 create, 기존은 revision 백업 + version + 1 + save', async () => {
    // 장로 존재, 촌장 없음
    const elder = {
      _id: 'v1',
      name: '장로', color: [0.9, 0.8, 0.5], dialogs: ['old'],
      questId: null, speed: 1.0, version: 2,
      save: vi.fn().mockResolvedValue(undefined),
    };
    (Villager.findOne as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(elder)   // 장로
      .mockResolvedValueOnce(null);   // 촌장
    (Villager.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (VillagerRevision.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await POST(makeRequest(SIMPLE_RON));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ created: 1, updated: 1 });

    // 장로: revision 백업 (이전 v2 + dialogs:['old']) → 갱신
    expect(VillagerRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      villagerId: 'v1',
      version: 2,
      villager: expect.objectContaining({ dialogs: ['old'], questId: null }),
    }));
    expect(elder.questId).toBe('gem_quest');
    expect(elder.dialogs).toEqual([]);
    expect(elder.version).toBe(3);
    expect(elder.save).toHaveBeenCalled();

    // 촌장: 신규 생성 — revision 백업 없음 (call count 1, 장로용만)
    expect(VillagerRevision.create).toHaveBeenCalledTimes(1);
    expect(Villager.create).toHaveBeenCalledWith(expect.objectContaining({
      name: '촌장', dialogs: ['안녕'], questId: null,
    }));
  });

  it('빈 배열 import 는 created=0, updated=0', async () => {
    const res = await POST(makeRequest('[]'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ created: 0, updated: 0 });
  });
});
