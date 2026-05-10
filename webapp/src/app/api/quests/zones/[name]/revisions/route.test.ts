import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/zone', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/zone-revision', () => ({ default: { find: vi.fn() } }));

import { GET } from './route';
import Zone from '@/models/zone';
import ZoneRevision from '@/models/zone-revision';

const params = Promise.resolve({ name: 'demon_cave' });

function makeRequest(): NextRequest {
  return new Request('http://localhost/api/quests/zones/demon_cave/revisions') as unknown as NextRequest;
}

describe('GET /api/quests/zones/[name]/revisions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('zone 이 없으면 404', async () => {
    (Zone.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(404);
  });

  it('version 내림차순으로 revision 목록', async () => {
    (Zone.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'z1' }) }),
    });
    const revs = [{ version: 3 }, { version: 2 }];
    const sortMock = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(revs) });
    (ZoneRevision.find as ReturnType<typeof vi.fn>).mockReturnValue({ sort: sortMock });

    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(200);
    expect(ZoneRevision.find).toHaveBeenCalledWith({ zoneId: 'z1' });
    expect(sortMock).toHaveBeenCalledWith({ version: -1 });
  });
});
