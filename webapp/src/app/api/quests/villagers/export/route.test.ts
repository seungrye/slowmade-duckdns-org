import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/villager', () => ({
  default: {
    find: vi.fn(),
  },
}));

import { GET } from './route';
import Villager from '@/models/villager';

describe('GET /api/villagers/export', () => {
  beforeEach(() => vi.clearAllMocks());

  it('villagers RON 텍스트와 attachment 헤더를 반환한다', async () => {
    (Villager.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { id: 'elder', name: '장로', color: [0.9, 0.8, 0.5], dialogs: [], speed: 0.5 },
        ]),
      }),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    expect(res.headers.get('Content-Disposition')).toContain('villagers.ron');
    const text = await res.text();
    expect(text).toContain('VillagerDef(');
    expect(text).toContain('id: "elder"');
    expect(text).toContain('name: "장로"');
    expect(text).not.toContain('quest_id');
  });

  it('빈 카탈로그도 빈 RON 으로 반환한다', async () => {
    (Villager.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('[]\n');
  });
});
