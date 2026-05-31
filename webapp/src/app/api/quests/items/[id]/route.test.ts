import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/item', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/item-revision', () => ({
  default: { create: vi.fn(), deleteMany: vi.fn() },
}));

import { GET, PUT, DELETE } from './route';
import Item from '@/models/item';
import ItemRevision from '@/models/item-revision';

function makeParams(id: string) {
  return Promise.resolve({ id });
}

function makeRequest(method: string, body?: object): NextRequest {
  return new Request(`http://localhost/api/quests/items/x`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

describe('GET /api/quests/items/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('찾지 못하면 404', async () => {
    (Item.findOne as ReturnType<typeof vi.fn>).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(makeRequest('GET'), { params: makeParams('없는id') });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/quests/items/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('찾지 못하면 404 (revision 백업 없음)', async () => {
    (Item.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PUT(makeRequest('PUT', { displayName: 'X' }), { params: makeParams('x') });
    expect(res.status).toBe(404);
    expect(ItemRevision.create).not.toHaveBeenCalled();
  });

  it('weapon: element 가 잘못된 값이면 400', async () => {
    const item = {
      _id: 'i1', id: 'sword', kind: 'weapon', displayName: '검',
      glyphAscii: '/', glyphGameIcon: '', pickupMessage: '',
      attackPower: 7, element: 'fire', version: 1,
      save: vi.fn(),
    };
    (Item.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(item);
    const res = await PUT(makeRequest('PUT', { element: 'plasma' }), { params: makeParams('sword') });
    expect(res.status).toBe(400);
    expect(ItemRevision.create).not.toHaveBeenCalled();
    expect(item.save).not.toHaveBeenCalled();
  });

  it('weapon: attackPower 갱신 + revision 백업 + version + 1', async () => {
    const item = {
      _id: 'i1', id: 'sword', kind: 'weapon', displayName: '검',
      glyphAscii: '/', glyphGameIcon: 'X', pickupMessage: '검',
      attackPower: 7, element: 'fire', version: 3,
      save: vi.fn().mockResolvedValue(undefined),
    };
    (Item.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(item);
    (ItemRevision.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await PUT(makeRequest('PUT', { attackPower: 10 }), { params: makeParams('sword') });

    expect(item.attackPower).toBe(10);
    expect(item.element).toBe('fire'); // 변경 없음
    expect(item.version).toBe(4);
    expect(ItemRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      itemId: 'i1', version: 3,
      item: expect.objectContaining({ kind: 'weapon', attackPower: 7 }),
    }));
  });

  it('quest: imagePath 갱신', async () => {
    const item = {
      _id: 'i1', id: 'gem', kind: 'quest', displayName: '보석',
      glyphAscii: '*', glyphGameIcon: '◆', pickupMessage: '획득',
      imagePath: 'scene/old.png', version: 1,
      save: vi.fn().mockResolvedValue(undefined),
    };
    (Item.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(item);
    (ItemRevision.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await PUT(makeRequest('PUT', { imagePath: 'scene/new.png' }), { params: makeParams('gem') });
    expect(item.imagePath).toBe('scene/new.png');
  });

  it('consumable: effect 갱신', async () => {
    const item = {
      _id: 'i1', id: 'health_potion', kind: 'consumable', displayName: '물약',
      glyphAscii: '!', glyphGameIcon: '❤', pickupMessage: '획득',
      effect: { type: 'Heal', amount: 8 }, version: 1,
      save: vi.fn().mockResolvedValue(undefined),
    };
    (Item.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(item);
    (ItemRevision.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await PUT(makeRequest('PUT', { effect: { type: 'Heal', amount: 12 } }), { params: makeParams('health_potion') });
    expect(item.effect).toEqual({ type: 'Heal', amount: 12 });
  });
});

describe('DELETE /api/quests/items/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('찾지 못하면 404', async () => {
    (Item.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await DELETE(makeRequest('DELETE'), { params: makeParams('x') });
    expect(res.status).toBe(404);
  });

  it('존재하면 revision 일괄 삭제 + deleteOne', async () => {
    const item = {
      _id: 'i1', id: 'sword',
      deleteOne: vi.fn().mockResolvedValue(undefined),
    };
    (Item.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(item);
    (ItemRevision.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await DELETE(makeRequest('DELETE'), { params: makeParams('sword') });
    expect(res.status).toBe(200);
    expect(ItemRevision.deleteMany).toHaveBeenCalledWith({ itemId: 'i1' });
    expect(item.deleteOne).toHaveBeenCalled();
  });
});
