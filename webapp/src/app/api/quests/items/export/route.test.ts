import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/item', () => ({ default: { find: vi.fn() } }));

import { GET } from './route';
import Item from '@/models/item';

function makeRequest(url: string): NextRequest {
  return new Request(url) as unknown as NextRequest;
}

describe('GET /api/quests/items/export', () => {
  beforeEach(() => vi.clearAllMocks());

  it('kind 누락 → 400', async () => {
    const res = await GET(makeRequest('http://localhost/api/quests/items/export'));
    expect(res.status).toBe(400);
  });

  it('weapon export — RON 텍스트 + weapons.ron 파일명', async () => {
    (Item.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            id: 'sword', kind: 'weapon', displayName: '검',
            glyphAscii: '/', glyphUnicode: 'X', glyphGameIcon: 'X',
            pickupMessage: '획득', attackPower: 7, element: 'fire',
          },
        ]),
      }),
    });
    const res = await GET(makeRequest('http://localhost/api/quests/items/export?kind=weapon'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('weapons.ron');
    const text = await res.text();
    expect(text).toContain('WeaponDef(');
    expect(text).toContain('attack_power: 7');
    expect(text).toContain('element: Some("fire")');
  });

  it('quest export — quest_items.ron 파일명', async () => {
    (Item.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            id: 'gem', kind: 'quest', displayName: '보석',
            glyphAscii: '*', glyphUnicode: '◆', glyphGameIcon: '◆',
            pickupMessage: '획득', imagePath: 'scene/x.png',
          },
        ]),
      }),
    });
    const res = await GET(makeRequest('http://localhost/api/quests/items/export?kind=quest'));
    expect(res.headers.get('Content-Disposition')).toContain('quest_items.ron');
    const text = await res.text();
    expect(text).toContain('QuestItemDef(');
    expect(text).toContain('image_path: "scene/x.png"');
  });

  it('빈 카탈로그 → []\\n', async () => {
    (Item.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    });
    const res = await GET(makeRequest('http://localhost/api/quests/items/export?kind=weapon'));
    expect(await res.text()).toBe('[]\n');
  });
});
