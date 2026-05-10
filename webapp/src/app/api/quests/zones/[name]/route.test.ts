import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/zone', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/zone-revision', () => ({
  default: { create: vi.fn(), deleteMany: vi.fn() },
}));

import { GET, PUT, DELETE } from './route';
import Zone from '@/models/zone';
import ZoneRevision from '@/models/zone-revision';

function makeParams(name: string) { return Promise.resolve({ name }); }

function makeRequest(method: string, body?: object): NextRequest {
  return new Request('http://localhost/api/quests/zones/x', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

describe('GET /api/quests/zones/[name]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('찾지 못하면 404', async () => {
    (Zone.findOne as ReturnType<typeof vi.fn>).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(makeRequest('GET'), { params: makeParams('없는zone') });
    expect(res.status).toBe(404);
  });

  it('decodeURIComponent 로 한글 name 처리', async () => {
    (Zone.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ name: '동굴', generator: 'bsp' }),
    });
    const encoded = encodeURIComponent('동굴');
    await GET(makeRequest('GET'), { params: makeParams(encoded) });
    expect(Zone.findOne).toHaveBeenCalledWith({ name: '동굴' });
  });
});

describe('PUT /api/quests/zones/[name]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('찾지 못하면 404 (revision 백업 없음)', async () => {
    (Zone.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PUT(makeRequest('PUT', { generator: 'bsp' }), { params: makeParams('x') });
    expect(res.status).toBe(404);
    expect(ZoneRevision.create).not.toHaveBeenCalled();
  });

  it('generator 가 빈 문자열이면 400', async () => {
    const zone = { _id: 'z1', save: vi.fn() };
    (Zone.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(zone);
    const res = await PUT(makeRequest('PUT', { generator: '   ' }), { params: makeParams('x') });
    expect(res.status).toBe(400);
    expect(zone.save).not.toHaveBeenCalled();
  });

  it('갱신 + revision 백업 + version + 1', async () => {
    const zone = {
      _id: 'z1', name: 'demon_cave', generator: 'cellular_automata',
      description: '', version: 2,
      save: vi.fn().mockResolvedValue(undefined),
    };
    (Zone.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(zone);
    (ZoneRevision.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await PUT(makeRequest('PUT', { generator: 'bsp_indoor', description: '동굴' }), { params: makeParams('demon_cave') });

    expect(zone.generator).toBe('bsp_indoor');
    expect(zone.description).toBe('동굴');
    expect(zone.version).toBe(3);
    expect(ZoneRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      zoneId: 'z1', version: 2,
      zone: expect.objectContaining({ generator: 'cellular_automata' }),
    }));
  });
});

describe('DELETE /api/quests/zones/[name]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('찾지 못하면 404', async () => {
    (Zone.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await DELETE(makeRequest('DELETE'), { params: makeParams('x') });
    expect(res.status).toBe(404);
  });

  it('존재하면 revision 일괄 삭제 + deleteOne', async () => {
    const zone = {
      _id: 'z1', name: 'demon_cave',
      deleteOne: vi.fn().mockResolvedValue(undefined),
    };
    (Zone.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(zone);
    (ZoneRevision.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await DELETE(makeRequest('DELETE'), { params: makeParams('demon_cave') });
    expect(res.status).toBe(200);
    expect(ZoneRevision.deleteMany).toHaveBeenCalledWith({ zoneId: 'z1' });
    expect(zone.deleteOne).toHaveBeenCalled();
  });
});
