// /api/web-adventure/content/v1 — 전 씬 통합 GET + 캐시 헤더.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/web-adventure-scene', () => ({
  default: { find: vi.fn() },
}));

import { GET, OPTIONS } from './route';
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
    const res = await GET(new Request('http://localhost/api/web-adventure/content/v1'));
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
    const res = await GET(new Request('http://localhost/api/web-adventure/content/v1'));
    const cacheControl = res.headers.get('Cache-Control') ?? '';
    expect(cacheControl).toContain('max-age=60');
  });

  it('CORS 허용 헤더(앱 WebView cross-origin fetch용)를 갖는다', async () => {
    (WebAdventureScene.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(new Request('http://localhost/api/web-adventure/content/v1'));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('OPTIONS preflight 는 204 + CORS 헤더', () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods') ?? '').toContain('GET');
  });
});

// 문체 변형 (#73) — 사건은 treatment 가 정본, 표현만 갈린다.
// 랜덤 선택은 클라이언트가 한다(서버가 매번 랜덤이면 캐시를 못 쓴다). 서버는 메타만 준다.
describe('문체(voice) 선택', () => {
  const scenes = [
    { id: 'a', title: 'A', body: ['기본 A'], choices: [], treatment: ['뼈대 A'], variants: { prose: ['산문 A'] } },
    { id: 'b', title: 'B', body: ['기본 B'], choices: [], treatment: ['뼈대 B'], variants: {} },
  ];
  const req = (qs: string) => new Request(`http://localhost/api/web-adventure/content/v1${qs}`);

  beforeEach(() => {
    vi.clearAllMocks();
    (WebAdventureScene.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(scenes),
    });
  });

  it('voice 를 주면 그 변형으로 body 를 채운다', async () => {
    const body = await (await GET(req('?voice=prose'))).json();
    expect(body.data.scenes.find((s: { id: string }) => s.id === 'a').body).toEqual(['산문 A']);
  });

  it('변형이 없는 씬은 기본 body 로 폴백한다(뼈대가 아니라)', async () => {
    const body = await (await GET(req('?voice=prose'))).json();
    expect(body.data.scenes.find((s: { id: string }) => s.id === 'b').body).toEqual(['기본 B']);
  });

  it('treatment·variants 는 응답에 내려보내지 않는다', async () => {
    const body = await (await GET(req('?voice=prose'))).json();
    for (const s of body.data.scenes) {
      expect(s.treatment).toBeUndefined();
      expect(s.variants).toBeUndefined();
    }
  });

  it('선택된 voice 와 문체별 완비율을 함께 준다', async () => {
    const body = await (await GET(req('?voice=prose'))).json();
    expect(body.data.voice).toBe('prose');
    expect(body.data.voices.prose).toEqual({ filled: 1, total: 2, complete: false });
  });

  it('voice 미지정이면 기본 문체 — 캐시 가능해야 하므로 서버가 랜덤을 돌리지 않는다', async () => {
    const body = await (await GET(req(''))).json();
    expect(body.data.voice).toBe('default');
    expect(body.data.scenes.find((s: { id: string }) => s.id === 'a').body).toEqual(['기본 A']);
  });

  it('모르는 voice 는 전부 기본 body 로 폴백', async () => {
    const body = await (await GET(req('?voice=nope'))).json();
    expect(body.data.scenes.map((s: { body: string[] }) => s.body)).toEqual([['기본 A'], ['기본 B']]);
  });
});
