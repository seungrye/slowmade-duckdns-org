import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/item', () => ({ default: { find: vi.fn(), deleteMany: vi.fn() } }));
vi.mock('@/models/item-revision', () => ({ default: { deleteMany: vi.fn() } }));

import { POST } from './route';
import Item from '@/models/item';
import ItemRevision from '@/models/item-revision';

function makeRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/quests/items/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('POST /api/quests/items/bulk-delete', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ids 가 비어있으면 400', async () => {
    const res = await POST(makeRequest({ ids: [] }));
    expect(res.status).toBe(400);
    expect(ItemRevision.deleteMany).not.toHaveBeenCalled();
    expect(Item.deleteMany).not.toHaveBeenCalled();
  });

  it('ids 가 배열이 아니면 400', async () => {
    const res = await POST(makeRequest({ ids: 'sword' }));
    expect(res.status).toBe(400);
  });

  it('잘못된 JSON 이면 400', async () => {
    const res = await POST(makeRequest('not json'));
    expect(res.status).toBe(400);
  });

  it('선택한 item 들의 revision cascade 삭제 후 deleteMany 호출', async () => {
    (Item.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: 'i1' }, { _id: 'i2' }]),
    });
    (ItemRevision.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (Item.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ deletedCount: 2 });

    const res = await POST(makeRequest({ ids: ['sword', 'gem'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ deleted: 2 });
    expect(ItemRevision.deleteMany).toHaveBeenCalledWith({ itemId: { $in: ['i1', 'i2'] } });
    expect(Item.deleteMany).toHaveBeenCalledWith({ id: { $in: ['sword', 'gem'] } });
  });

  it('매칭되는 item 이 없으면 revision 삭제는 건너뛰고 deleted: 0', async () => {
    (Item.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    });
    (Item.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ deletedCount: 0 });

    const res = await POST(makeRequest({ ids: ['nonexistent'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ deleted: 0 });
    expect(ItemRevision.deleteMany).not.toHaveBeenCalled();
  });
});
