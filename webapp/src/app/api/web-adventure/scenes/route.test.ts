// /api/web-adventure/scenes — GET (목록), POST (생성) 테스트.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
// #179 — 씬 쓰기는 작성자 전용이 됐다(가입만 하면 남이 고칠 수 있었다). 인가는 목으로 갈아 끼운다.
vi.mock('@/lib/require-owner', () => ({ requireOwner: vi.fn() }));
vi.mock('@/models/web-adventure-scene', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

import { GET, POST } from './route';
import { auth } from '@/auth';
import { requireOwner } from '@/lib/require-owner';
import WebAdventureScene from '@/models/web-adventure-scene';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

function makeRequest(body?: object): NextRequest {
  return new Request('http://localhost/api/web-adventure/scenes', {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

describe('GET /api/web-adventure/scenes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('씬 목록을 반환한다', async () => {
    const mockScenes = [
      { id: 'town_square_dawn', title: '마을 광장의 새벽' },
      { id: 'market_morning', title: '시장 — 아침' },
    ];
    (WebAdventureScene.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(mockScenes) }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(mockScenes);
  });
});

describe('POST /api/web-adventure/scenes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(auth).mockResolvedValue({ user: { email: 'owner@test' } }); // 기본 로그인 상태
    vi.mocked(requireOwner).mockResolvedValue({ email: 'owner@test' }); // 기본 작성자
  });

  it('작성자가 아니면 404 (씬 생성는 작성자만 — #179)', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(requireOwner).mockResolvedValue(NextResponse.json({ message: 'Not found' }, { status: 404 }));
    const res = await POST(makeRequest({ id: 'x', title: 't', illustration: '/x.jpg', body: ['b'] }));
    expect(res.status).toBe(404);
  });

  it('id / title / illustration / body 필수 누락 시 400', async () => {
    const res = await POST(makeRequest({ id: 'x' }));
    expect(res.status).toBe(400);
  });

  it('이미 존재하는 id 면 409', async () => {
    (WebAdventureScene.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'town_square_dawn' });
    const res = await POST(makeRequest({
      id: 'town_square_dawn', title: '광장', illustration: '/x.jpg', body: ['본문'], choices: [],
    }));
    expect(res.status).toBe(409);
  });

  it('정상 생성 시 201', async () => {
    (WebAdventureScene.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (WebAdventureScene.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'new_scene' });
    const res = await POST(makeRequest({
      id: 'new_scene', title: '새 씬', illustration: '/x.jpg',
      body: ['본문'], choices: [{ kind: 'plain', id: 'c', label: 'L', to: 't' }],
    }));
    expect(res.status).toBe(201);
  });
});
