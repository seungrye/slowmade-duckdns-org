// /api/web-adventure/content/v1 — 전 씬 통합 GET + 캐시 헤더.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/web-adventure-scene', () => ({
  default: { find: vi.fn() },
}));

import { GET } from './route';
import WebAdventureScene from '@/models/web-adventure-scene';

describe('GET /api/web-adventure/content/v1', () => {
  beforeEach(() => vi.clearAllMocks());

  it('모든 씬을 객체 형식으로 반환한다', async () => {
    const scenes = [
      { id: 'town_square_dawn', title: '광장', body: ['…'], choices: [] },
      { id: 'market_morning', title: '시장', body: ['…'], choices: [] },
    ];
    (WebAdventureScene.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(scenes),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.scenes).toBeDefined();
    expect(Array.isArray(body.data.scenes)).toBe(true);
    expect(body.data.scenes).toHaveLength(2);
  });

  it('Cache-Control: max-age=60 헤더를 갖는다', async () => {
    (WebAdventureScene.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET();
    const cacheControl = res.headers.get('Cache-Control') ?? '';
    expect(cacheControl).toContain('max-age=60');
  });
});
