import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/item', () => ({
  default: { findOne: vi.fn(), create: vi.fn() },
}));
vi.mock('@/models/item-revision', () => ({
  default: { create: vi.fn() },
}));

import { POST } from './route';
import Item from '@/models/item';
import ItemRevision from '@/models/item-revision';

function makeRequest(url: string, body: string): NextRequest {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body,
  }) as unknown as NextRequest;
}

const SWORD_RON = `[
    WeaponDef(
        id: "sword",
        display_name: "검",
        glyph_ascii: "/",
        glyph_unicode: "X",
        glyph_game_icon: "X",
        pickup_message: "획득",
        attack_power: 7,
        element: Some("fire"),
    ),
]`;

describe('POST /api/quests/items/import', () => {
  beforeEach(() => vi.clearAllMocks());

  it('kind 파라미터 없으면 400', async () => {
    const res = await POST(makeRequest('http://localhost/api/quests/items/import', '[]'));
    expect(res.status).toBe(400);
  });

  it('잘못된 kind 면 400', async () => {
    const res = await POST(makeRequest('http://localhost/api/quests/items/import?kind=mystery', '[]'));
    expect(res.status).toBe(400);
  });

  it('잘못된 RON 이면 400', async () => {
    const res = await POST(makeRequest('http://localhost/api/quests/items/import?kind=weapon', 'garbage'));
    expect(res.status).toBe(400);
  });

  it('신규 weapon 은 create, version 1', async () => {
    (Item.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (Item.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const res = await POST(makeRequest('http://localhost/api/quests/items/import?kind=weapon', SWORD_RON));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ created: 1, updated: 0 });
    expect(Item.create).toHaveBeenCalledWith(expect.objectContaining({
      id: 'sword', kind: 'weapon', attackPower: 7, element: 'fire',
    }));
  });

  it('기존 weapon 은 revision 백업 + version + 1', async () => {
    const existing = {
      _id: 'i1', id: 'sword', kind: 'weapon',
      displayName: '구검', glyphAscii: '/', glyphGameIcon: 'X',
      pickupMessage: '획득', attackPower: 5, element: 'ice', version: 2,
      save: vi.fn().mockResolvedValue(undefined),
    };
    (Item.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (ItemRevision.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await POST(makeRequest('http://localhost/api/quests/items/import?kind=weapon', SWORD_RON));
    expect(res.status).toBe(200);
    expect(ItemRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      itemId: 'i1', version: 2,
    }));
    expect(existing.attackPower).toBe(7);
    expect(existing.element).toBe('fire');
    expect(existing.version).toBe(3);
  });

  it('id 가 다른 kind 로 이미 존재하면 409', async () => {
    const existing = { _id: 'i1', id: 'sword', kind: 'quest' };
    (Item.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    const res = await POST(makeRequest('http://localhost/api/quests/items/import?kind=weapon', SWORD_RON));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).toContain('sword');
  });
});
