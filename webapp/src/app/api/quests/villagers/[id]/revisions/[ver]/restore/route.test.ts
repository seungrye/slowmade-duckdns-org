import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/villager', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/villager-revision', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

import { POST } from './route';
import Villager from '@/models/villager';
import VillagerRevision from '@/models/villager-revision';

function makeParams(id: string, ver: string) {
  return Promise.resolve({ id, ver });
}

function makeRequest(): NextRequest {
  return new Request('http://localhost/api/quests/villagers/x/revisions/2/restore', {
    method: 'POST',
  }) as unknown as NextRequest;
}

describe('POST /api/quests/villagers/[id]/revisions/[ver]/restore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('villager 가 없으면 404', async () => {
    (Villager.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(makeRequest(), { params: makeParams('x', '2') });
    expect(res.status).toBe(404);
  });

  it('해당 version 의 revision 이 없으면 404', async () => {
    const villager = { _id: 'v1', version: 5 };
    (Villager.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(villager);
    (VillagerRevision.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    const res = await POST(makeRequest(), { params: makeParams('x', '2') });
    expect(res.status).toBe(404);
  });

  it('롤백 시 현재 상태 백업 + revision 데이터로 덮어쓰기 + version + 1', async () => {
    const villager = {
      _id: 'v1', id: 'elder', name: '원로',
      color: [0.1, 0.1, 0.1],
      dialogs: ['current'],
      speed: 2.0,
      version: 5,
      save: vi.fn().mockResolvedValue(undefined),
    };
    (Villager.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(villager);
    (VillagerRevision.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        villager: {
          id: 'elder',
          name: '장로',
          color: [0.9, 0.8, 0.5],
          dialogs: ['old'],
          speed: 0.5,
        },
      }),
    });
    (VillagerRevision.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await POST(makeRequest(), { params: makeParams('elder', '2') });
    expect(res.status).toBe(200);

    // 현재(v5) 상태 백업 호출
    expect(VillagerRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      villagerId: 'v1',
      version: 5,
      villager: expect.objectContaining({ id: 'elder', name: '원로', dialogs: ['current'] }),
    }));
    // v2 데이터 적용
    expect(villager.name).toBe('장로');
    expect(villager.color).toEqual([0.9, 0.8, 0.5]);
    expect(villager.dialogs).toEqual(['old']);
    expect(villager.speed).toBe(0.5);
    expect(villager.version).toBe(6);
  });
});
