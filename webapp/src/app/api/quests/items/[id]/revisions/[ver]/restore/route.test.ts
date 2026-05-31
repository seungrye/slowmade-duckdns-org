import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/item', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/item-revision', () => ({
  default: { findOne: vi.fn(), create: vi.fn() },
}));

import { POST } from './route';
import Item from '@/models/item';
import ItemRevision from '@/models/item-revision';

function makeParams(id: string, ver: string) {
  return Promise.resolve({ id, ver });
}

function makeRequest(): NextRequest {
  return new Request('http://localhost/api/quests/items/sword/revisions/2/restore', {
    method: 'POST',
  }) as unknown as NextRequest;
}

describe('POST /api/quests/items/[id]/revisions/[ver]/restore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('item 없으면 404', async () => {
    (Item.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(makeRequest(), { params: makeParams('x', '2') });
    expect(res.status).toBe(404);
  });

  it('해당 version revision 없으면 404', async () => {
    (Item.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({ _id: 'i1' });
    (ItemRevision.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    const res = await POST(makeRequest(), { params: makeParams('x', '2') });
    expect(res.status).toBe(404);
  });

  it('weapon 롤백 — 백업 + 종별 필드 적용 + version + 1', async () => {
    const item = {
      _id: 'i1', id: 'sword', kind: 'weapon',
      displayName: '검(현재)', glyphAscii: '/', glyphGameIcon: 'X',
      pickupMessage: '획득', attackPower: 12, element: 'lightning', version: 5,
      save: vi.fn().mockResolvedValue(undefined),
    };
    (Item.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(item);
    (ItemRevision.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        item: {
          id: 'sword', kind: 'weapon',
          displayName: '검(과거)',
          glyphAscii: '/', glyphGameIcon: 'X', pickupMessage: '획득',
          attackPower: 7, element: 'fire',
        },
      }),
    });
    (ItemRevision.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await POST(makeRequest(), { params: makeParams('sword', '2') });
    expect(res.status).toBe(200);

    expect(ItemRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      itemId: 'i1', version: 5,
      item: expect.objectContaining({ attackPower: 12, element: 'lightning' }),
    }));
    expect(item.attackPower).toBe(7);
    expect(item.element).toBe('fire');
    expect(item.displayName).toBe('검(과거)');
    expect(item.version).toBe(6);
  });
});
