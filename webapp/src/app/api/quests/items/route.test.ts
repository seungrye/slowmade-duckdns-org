import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/item', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

import { GET, POST, validateItemForCreate } from './route';
import Item from '@/models/item';

function makeRequest(url: string, body?: object): NextRequest {
  return new Request(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

const baseValid = {
  displayName: '검',
  glyphAscii: '/',
  glyphUnicode: 'X',
  glyphGameIcon: 'X',
  pickupMessage: '검 획득',
};

describe('validateItemForCreate', () => {
  it('필수 문자열 누락 → 실패', () => {
    expect(validateItemForCreate({}).ok).toBe(false);
    expect(validateItemForCreate({ id: 'x', kind: 'weapon' }).ok).toBe(false);
  });

  it('지원하지 않는 kind → 실패', () => {
    expect(validateItemForCreate({
      id: 'x', kind: 'mystery', ...baseValid, attackPower: 5,
    }).ok).toBe(false);
  });

  it('weapon 은 attackPower 필수, element 는 null/fire/ice/lightning', () => {
    expect(validateItemForCreate({ id: 'sword', kind: 'weapon', ...baseValid }).ok).toBe(false);
    expect(validateItemForCreate({ id: 'sword', kind: 'weapon', ...baseValid, attackPower: 7 }).ok).toBe(true);
    expect(validateItemForCreate({ id: 'sword', kind: 'weapon', ...baseValid, attackPower: 7, element: 'plasma' }).ok).toBe(false);
    expect(validateItemForCreate({ id: 'sword', kind: 'weapon', ...baseValid, attackPower: 7, element: 'fire' }).ok).toBe(true);
    expect(validateItemForCreate({ id: 'sword', kind: 'weapon', ...baseValid, attackPower: 7, element: null }).ok).toBe(true);
  });

  it('armor 는 defenseBonus 필수', () => {
    expect(validateItemForCreate({ id: 'a', kind: 'armor', ...baseValid }).ok).toBe(false);
    expect(validateItemForCreate({ id: 'a', kind: 'armor', ...baseValid, defenseBonus: 2 }).ok).toBe(true);
  });

  it('consumable 은 effect { type: "Heal", amount: number } 필수', () => {
    expect(validateItemForCreate({ id: 'p', kind: 'consumable', ...baseValid }).ok).toBe(false);
    expect(validateItemForCreate({ id: 'p', kind: 'consumable', ...baseValid, effect: { type: 'Burn', amount: 1 } }).ok).toBe(false);
    expect(validateItemForCreate({ id: 'p', kind: 'consumable', ...baseValid, effect: { type: 'Heal', amount: 8 } }).ok).toBe(true);
  });

  it('quest 는 imagePath 필수', () => {
    expect(validateItemForCreate({ id: 'gem', kind: 'quest', ...baseValid }).ok).toBe(false);
    expect(validateItemForCreate({ id: 'gem', kind: 'quest', ...baseValid, imagePath: 'scene/x.png' }).ok).toBe(true);
  });
});

describe('GET /api/quests/items', () => {
  beforeEach(() => vi.clearAllMocks());

  it('필터 없으면 전체 (kind, id 정렬)', async () => {
    const all = [{ id: 'a', kind: 'armor' }, { id: 'sword', kind: 'weapon' }];
    const sortMock = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(all) });
    (Item.find as ReturnType<typeof vi.fn>).mockReturnValue({ sort: sortMock });

    const res = await GET(makeRequest('http://localhost/api/quests/items'));
    expect(res.status).toBe(200);
    expect(Item.find).toHaveBeenCalledWith({});
    expect(sortMock).toHaveBeenCalledWith({ kind: 1, id: 1 });
  });

  it('?kind=weapon 으로 필터', async () => {
    const sortMock = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    (Item.find as ReturnType<typeof vi.fn>).mockReturnValue({ sort: sortMock });

    await GET(makeRequest('http://localhost/api/quests/items?kind=weapon'));
    expect(Item.find).toHaveBeenCalledWith({ kind: 'weapon' });
  });

  it('지원하지 않는 ?kind 면 400', async () => {
    const res = await GET(makeRequest('http://localhost/api/quests/items?kind=mystery'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/quests/items', () => {
  beforeEach(() => vi.clearAllMocks());

  it('검증 실패 시 400', async () => {
    const res = await POST(makeRequest('http://localhost/api/quests/items', { id: 'x', kind: 'weapon' }));
    expect(res.status).toBe(400);
  });

  it('id 중복 시 409', async () => {
    (Item.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'sword' });
    const res = await POST(makeRequest('http://localhost/api/quests/items', {
      id: 'sword', kind: 'weapon', ...baseValid, attackPower: 7,
    }));
    expect(res.status).toBe(409);
  });

  it('weapon 생성 — element 미제공 시 null', async () => {
    (Item.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (Item.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'sword' });

    await POST(makeRequest('http://localhost/api/quests/items', {
      id: 'sword', kind: 'weapon', ...baseValid, attackPower: 7,
    }));
    expect(Item.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'weapon', attackPower: 7, element: null,
    }));
  });

  it('quest 생성 — imagePath 저장됨', async () => {
    (Item.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (Item.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'gem' });

    await POST(makeRequest('http://localhost/api/quests/items', {
      id: 'gem', kind: 'quest', ...baseValid, imagePath: 'scene/open-chest.png',
    }));
    expect(Item.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'quest', imagePath: 'scene/open-chest.png',
    }));
  });

  it('consumable 생성 — effect 저장됨', async () => {
    (Item.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (Item.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'health_potion' });

    await POST(makeRequest('http://localhost/api/quests/items', {
      id: 'health_potion', kind: 'consumable', ...baseValid, effect: { type: 'Heal', amount: 8 },
    }));
    expect(Item.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'consumable', effect: { type: 'Heal', amount: 8 },
    }));
  });
});
