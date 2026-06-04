// /api/web-adventure/scenes/[id] — GET / PUT / DELETE 테스트.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/web-adventure-scene', () => ({
  default: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findOneAndDelete: vi.fn(),
  },
}));

import { GET, PUT, DELETE } from './route';
import WebAdventureScene from '@/models/web-adventure-scene';

const params = Promise.resolve({ id: 'town_square_dawn' });

function makeRequest(method: string, body?: object): NextRequest {
  return new Request('http://localhost/api/web-adventure/scenes/town_square_dawn', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

describe('GET /api/web-adventure/scenes/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('씬을 찾지 못하면 404', async () => {
    (WebAdventureScene.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    const res = await GET(makeRequest('GET'), { params });
    expect(res.status).toBe(404);
  });

  it('씬을 찾으면 200 + body', async () => {
    const scene = { id: 'town_square_dawn', title: '광장', body: ['…'], choices: [] };
    (WebAdventureScene.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(scene),
    });
    const res = await GET(makeRequest('GET'), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe('town_square_dawn');
  });
});

describe('PUT /api/web-adventure/scenes/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('씬을 찾지 못하면 404', async () => {
    (WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    const res = await PUT(makeRequest('PUT', { title: '바뀐 제목' }), { params });
    expect(res.status).toBe(404);
  });

  it('정상 업데이트 시 200', async () => {
    const updated = { id: 'town_square_dawn', title: '바뀐 제목' };
    (WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(updated),
    });
    const res = await PUT(makeRequest('PUT', { title: '바뀐 제목' }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.title).toBe('바뀐 제목');
  });
});

describe('DELETE /api/web-adventure/scenes/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('씬을 찾지 못하면 404', async () => {
    (WebAdventureScene.findOneAndDelete as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await DELETE(makeRequest('DELETE'), { params });
    expect(res.status).toBe(404);
  });

  it('정상 삭제 시 200', async () => {
    (WebAdventureScene.findOneAndDelete as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'town_square_dawn' });
    const res = await DELETE(makeRequest('DELETE'), { params });
    expect(res.status).toBe(200);
  });
});
