import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/item', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/item-revision', () => ({ default: { find: vi.fn() } }));

import { GET } from './route';
import Item from '@/models/item';
import ItemRevision from '@/models/item-revision';

const params = Promise.resolve({ id: 'sword' });

function makeRequest(): NextRequest {
  return new Request('http://localhost/api/quests/items/sword/revisions') as unknown as NextRequest;
}

describe('GET /api/quests/items/[id]/revisions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('item 이 없으면 404', async () => {
    (Item.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });
    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(404);
  });

  it('version 내림차순으로 revision 목록 반환', async () => {
    (Item.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'i1' }) }),
    });
    const revs = [{ version: 3 }, { version: 2 }, { version: 1 }];
    const sortMock = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(revs) });
    (ItemRevision.find as ReturnType<typeof vi.fn>).mockReturnValue({ sort: sortMock });

    const res = await GET(makeRequest(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(revs);
    expect(ItemRevision.find).toHaveBeenCalledWith({ itemId: 'i1' });
    expect(sortMock).toHaveBeenCalledWith({ version: -1 });
  });
});
