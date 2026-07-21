// /api/web-adventure/scenes/[id] — GET / PUT / DELETE 테스트.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/models/web-adventure-scene', () => ({
  default: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findOneAndDelete: vi.fn(),
  },
}));
vi.mock('@/models/web-adventure-scene-revision', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

import { GET, PUT, DELETE } from './route';
import { auth } from '@/auth';
import WebAdventureScene from '@/models/web-adventure-scene';
import WebAdventureSceneRevision from '@/models/web-adventure-scene-revision';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

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
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(auth).mockResolvedValue({ user: { email: 'owner@test' } });
  });

  it('로그인하지 않으면 401 (무인증 씬 수정 차단)', async () => {
    asMock(auth).mockResolvedValue(null);
    const res = await PUT(makeRequest('PUT', { title: 'x' }), { params });
    expect(res.status).toBe(401);
  });

  it('씬을 찾지 못하면 404 (findOne / findOneAndUpdate 모두 null)', async () => {
    (WebAdventureScene.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    (WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    const res = await PUT(makeRequest('PUT', { title: '바뀐 제목' }), { params });
    expect(res.status).toBe(404);
  });

  it('정상 업데이트 시 200', async () => {
    const existing = { id: 'town_square_dawn', title: '옛 제목' };
    const updated = { id: 'town_square_dawn', title: '바뀐 제목' };
    (WebAdventureScene.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(existing),
    });
    (WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(updated),
    });
    (WebAdventureSceneRevision.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });
    const res = await PUT(makeRequest('PUT', { title: '바뀐 제목' }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.title).toBe('바뀐 제목');
  });

  // #revision/v3 — git-like: snapshot = *변경 후* (updated). version = 이 PUT 의 0-based index.
  it('기존 씬 update 시 *변경 후* snapshot 으로 revision 자동 생성', async () => {
    const existing = { id: 'town_square_dawn', title: '옛 제목', body: ['옛 본문'] };
    const updated = { id: 'town_square_dawn', title: '새 제목', body: ['옛 본문'] };
    (WebAdventureScene.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(existing),
    });
    (WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(updated),
    });
    (WebAdventureSceneRevision.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });

    const res = await PUT(makeRequest('PUT', { title: '새 제목' }), { params });
    expect(res.status).toBe(200);

    // revision create — snapshot = *변경 후* (updated). version = existing.revisionCount.
    const createMock = WebAdventureSceneRevision.create as ReturnType<typeof vi.fn>;
    expect(createMock).toHaveBeenCalledOnce();
    const arg = createMock.mock.calls[0]![0] as {
      sceneId: string;
      snapshot: Record<string, unknown>;
      version: number;
      author: string;
    };
    expect(arg.sceneId).toBe('town_square_dawn');
    expect(arg.snapshot).toEqual(updated);
    // existing 에 revisionCount 없으면 0 (이 PUT 이 0 번째 commit).
    expect(arg.version).toBe(0);
  });

  // #revision/v4 — 모든 commit (첫 생성 포함) 시 revision 생성.
  it('첫 생성 (existing=null) 시 revision v0 생성', async () => {
    const updated = { id: 'town_square_dawn', title: '신규', revisionCount: 0 };
    (WebAdventureScene.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    (WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(updated),
    });

    const res = await PUT(makeRequest('PUT', { title: '신규' }), { params });
    expect(res.status).toBe(200);
    const createMock = WebAdventureSceneRevision.create as ReturnType<typeof vi.fn>;
    expect(createMock).toHaveBeenCalledOnce();
    const arg = createMock.mock.calls[0]![0] as { version: number; snapshot: Record<string, unknown> };
    expect(arg.version).toBe(0);
    expect(arg.snapshot).toEqual(updated);
  });

  // 옛 quest CMS 패턴 — PUT 시 scene.revisionCount $inc 1.
  it('기존 씬 update 시 scene.revisionCount 를 $inc 1 로 증가', async () => {
    const existing = { id: 'town_square_dawn', title: '옛', revisionCount: 2 };
    const updated = { id: 'town_square_dawn', title: '새', revisionCount: 3 };
    (WebAdventureScene.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(existing),
    });
    (WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(updated),
    });
    (WebAdventureSceneRevision.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });

    await PUT(makeRequest('PUT', { title: '새' }), { params });
    // findOneAndUpdate 호출 인자 — 두 번째가 update 쿼리.
    const updateCall = (WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>).mock.calls[0];
    const updateQuery = updateCall![1] as { $set?: Record<string, unknown>; $inc?: Record<string, unknown> };
    expect(updateQuery.$inc).toBeDefined();
    expect(updateQuery.$inc!.revisionCount).toBe(1);
  });

  // 옛 quest CMS 패턴 — 첫 생성 (existing=null) 시 revisionCount 증가 안 함.
  it('첫 생성 (existing=null) 시 $inc revisionCount 미적용', async () => {
    const updated = { id: 'town_square_dawn', title: '신규' };
    (WebAdventureScene.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    (WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(updated),
    });

    await PUT(makeRequest('PUT', { title: '신규' }), { params });
    const updateCall = (WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>).mock.calls[0];
    const updateQuery = updateCall![1] as { $set?: Record<string, unknown>; $inc?: Record<string, unknown> };
    // existing 없으므로 inc 적용 X. ($inc 키 자체가 없어야 한다.)
    expect(updateQuery.$inc).toBeUndefined();
  });

  // #revision/v4 — version = updated.revisionCount (그 commit 의 결과 revCount).
  it('existing.revisionCount=3 → updated.revisionCount=4 → revision version=4', async () => {
    const existing = { id: 'town_square_dawn', title: '옛', revisionCount: 3 };
    const updated = { id: 'town_square_dawn', title: '새', revisionCount: 4 };
    (WebAdventureScene.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(existing),
    });
    (WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(updated),
    });

    await PUT(makeRequest('PUT', { title: '새' }), { params });
    const createMock = WebAdventureSceneRevision.create as ReturnType<typeof vi.fn>;
    const arg = createMock.mock.calls[0]![0] as { version: number; snapshot: Record<string, unknown> };
    expect(arg.version).toBe(4);
    expect(arg.snapshot).toEqual(updated);
  });

  // 그래프 카드 이동 — position 만 바뀐 커밋은 버저닝하지 않는다(드래그마다 리비전 방지).
  it('position 만 변경 시 revision 미생성 + revisionCount 미증가', async () => {
    const existing = { id: 'town_square_dawn', title: '광장', revisionCount: 2 };
    const updated = { id: 'town_square_dawn', title: '광장', revisionCount: 2, position: { x: 10, y: 20 } };
    (WebAdventureScene.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(existing),
    });
    (WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(updated),
    });

    const res = await PUT(makeRequest('PUT', { position: { x: 10, y: 20 } }), { params });
    expect(res.status).toBe(200);
    // revision 생성 안 함
    expect(WebAdventureSceneRevision.create as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    // revisionCount $inc 안 함
    const updateQuery = (WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>).mock.calls[0]![1] as {
      $set?: Record<string, unknown>; $inc?: Record<string, unknown>;
    };
    expect(updateQuery.$inc).toBeUndefined();
    expect(updateQuery.$set).toMatchObject({ position: { x: 10, y: 20 } });
  });

  // position 과 content 를 함께 바꾸면 종전대로 버저닝한다.
  it('position + content(title) 동시 변경은 버저닝한다', async () => {
    const existing = { id: 'town_square_dawn', title: '옛', revisionCount: 1 };
    const updated = { id: 'town_square_dawn', title: '새', revisionCount: 2, position: { x: 5, y: 5 } };
    (WebAdventureScene.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(existing),
    });
    (WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(updated),
    });

    await PUT(makeRequest('PUT', { title: '새', position: { x: 5, y: 5 } }), { params });
    expect(WebAdventureSceneRevision.create as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
    const updateQuery = (WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>).mock.calls[0]![1] as {
      $inc?: Record<string, unknown>;
    };
    expect(updateQuery.$inc!.revisionCount).toBe(1);
  });
});

describe('DELETE /api/web-adventure/scenes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(auth).mockResolvedValue({ user: { email: 'owner@test' } });
  });

  it('로그인하지 않으면 401 (무인증 씬 삭제 차단)', async () => {
    asMock(auth).mockResolvedValue(null);
    const res = await DELETE(makeRequest('DELETE'), { params });
    expect(res.status).toBe(401);
  });

  it('씬을 찾지 못하면 404 (소프트 삭제 — findOneAndUpdate null)', async () => {
    (WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await DELETE(makeRequest('DELETE'), { params });
    expect(res.status).toBe(404);
  });

  it('정상 삭제 시 200 (소프트 삭제 — isDeleted=true 로 update)', async () => {
    const upd = WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>;
    upd.mockResolvedValue({ id: 'town_square_dawn', isDeleted: true });
    const res = await DELETE(makeRequest('DELETE'), { params });
    expect(res.status).toBe(200);
    // 하드 삭제가 아니라 isDeleted 를 세팅해야 한다.
    const setArg = upd.mock.calls[0]![1] as { $set?: Record<string, unknown> };
    expect(setArg.$set?.isDeleted).toBe(true);
  });
});
