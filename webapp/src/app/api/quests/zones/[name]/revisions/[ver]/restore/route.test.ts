import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/zone', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/zone-revision', () => ({
  default: { findOne: vi.fn(), create: vi.fn() },
}));

import { POST } from './route';
import Zone from '@/models/zone';
import ZoneRevision from '@/models/zone-revision';

function makeParams(name: string, ver: string) { return Promise.resolve({ name, ver }); }

function makeRequest(): NextRequest {
  return new Request('http://localhost/api/quests/zones/demon_cave/revisions/2/restore', {
    method: 'POST',
  }) as unknown as NextRequest;
}

describe('POST /api/quests/zones/[name]/revisions/[ver]/restore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('zone 없으면 404', async () => {
    (Zone.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(makeRequest(), { params: makeParams('x', '2') });
    expect(res.status).toBe(404);
  });

  it('해당 version revision 없으면 404', async () => {
    (Zone.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({ _id: 'z1', version: 5 });
    (ZoneRevision.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    const res = await POST(makeRequest(), { params: makeParams('x', '2') });
    expect(res.status).toBe(404);
  });

  it('롤백 — 백업 + 데이터 적용 + version + 1', async () => {
    const zone = {
      _id: 'z1', name: 'demon_cave',
      generator: 'bsp', description: '현재', version: 5,
      save: vi.fn().mockResolvedValue(undefined),
    };
    (Zone.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(zone);
    (ZoneRevision.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        zone: { name: 'demon_cave', generator: 'cellular_automata', description: '과거' },
      }),
    });
    (ZoneRevision.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await POST(makeRequest(), { params: makeParams('demon_cave', '2') });
    expect(res.status).toBe(200);

    expect(ZoneRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      zoneId: 'z1', version: 5,
      zone: expect.objectContaining({ generator: 'bsp' }),
    }));
    expect(zone.generator).toBe('cellular_automata');
    expect(zone.description).toBe('과거');
    expect(zone.version).toBe(6);
  });
});
