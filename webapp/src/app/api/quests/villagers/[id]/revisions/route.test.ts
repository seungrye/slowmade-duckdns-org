import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/villager', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/villager-revision', () => ({ default: { find: vi.fn() } }));

import { GET } from './route';
import Villager from '@/models/villager';
import VillagerRevision from '@/models/villager-revision';

const params = Promise.resolve({ id: 'elder' });

function makeRequest(): NextRequest {
  return new Request('http://localhost/api/quests/villagers/x/revisions') as unknown as NextRequest;
}

describe('GET /api/quests/villagers/[id]/revisions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('villager 가 없으면 404', async () => {
    (Villager.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(404);
  });

  it('version 내림차순으로 revision 목록 반환', async () => {
    (Villager.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'v1' }) }),
    });
    const revs = [{ version: 3 }, { version: 2 }, { version: 1 }];
    const sortMock = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(revs) });
    (VillagerRevision.find as ReturnType<typeof vi.fn>).mockReturnValue({ sort: sortMock });

    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(revs);
    expect(VillagerRevision.find).toHaveBeenCalledWith({ villagerId: 'v1' });
    expect(sortMock).toHaveBeenCalledWith({ version: -1 });
  });
});
