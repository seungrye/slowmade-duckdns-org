// /api/web-adventure/scenes/[id] - GET, PUT and DELETE tests.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
// #179 - scene writes became author-only (merely signing up let anyone edit them). Authorisation is swapped for a mock.
vi.mock('@/lib/require-owner', () => ({ requireOwner: vi.fn() }));
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
import { requireOwner } from '@/lib/require-owner';
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
    vi.mocked(requireOwner).mockResolvedValue({ email: 'owner@test' }); // the author by default
  });

  it('작성자가 아니면 404 (씬 수정는 작성자만 — #179)', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(requireOwner).mockResolvedValue(NextResponse.json({ message: 'Not found' }, { status: 404 }));
    const res = await PUT(makeRequest('PUT', { title: 'x' }), { params });
    expect(res.status).toBe(404);
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

  // #revision/v3 - git-like: the snapshot is *after* the change (updated). version is this PUT's 0-based index.
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

    // The revision create - the snapshot is *after* the change (updated). version = existing.revisionCount.
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
    // With no revisionCount on existing it is 0 (this PUT is commit 0).
    expect(arg.version).toBe(0);
  });

  // #revision/v4 - a revision is created on every commit (the first creation included).
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

  // The old quest CMS pattern - a PUT $incs scene.revisionCount by 1.
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
    // findOneAndUpdate's arguments - the second is the update query.
    const updateCall = (WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>).mock.calls[0];
    const updateQuery = updateCall![1] as { $set?: Record<string, unknown>; $inc?: Record<string, unknown> };
    expect(updateQuery.$inc).toBeDefined();
    expect(updateQuery.$inc!.revisionCount).toBe(1);
  });

  // The old quest CMS pattern - on a first creation (existing=null) revisionCount is not incremented.
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
    // With no existing, no inc applies. (The $inc key itself must be absent.)
    expect(updateQuery.$inc).toBeUndefined();
  });

  // #revision/v4 - version = updated.revisionCount (the resulting revCount of that commit).
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

  // Moving a graph card - a commit changing only position is not versioned (preventing a revision per drag).
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
    // no revision is created
    expect(WebAdventureSceneRevision.create as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    // revisionCount is not $inc'd
    const updateQuery = (WebAdventureScene.findOneAndUpdate as ReturnType<typeof vi.fn>).mock.calls[0]![1] as {
      $set?: Record<string, unknown>; $inc?: Record<string, unknown>;
    };
    expect(updateQuery.$inc).toBeUndefined();
    expect(updateQuery.$set).toMatchObject({ position: { x: 10, y: 20 } });
  });

  // Changing position and content together versions as before.
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
    vi.mocked(requireOwner).mockResolvedValue({ email: 'owner@test' }); // the author by default
  });

  it('작성자가 아니면 404 (씬 삭제는 작성자만 — #179)', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(requireOwner).mockResolvedValue(NextResponse.json({ message: 'Not found' }, { status: 404 }));
    const res = await DELETE(makeRequest('DELETE'), { params });
    expect(res.status).toBe(404);
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
    // It must set isDeleted rather than hard delete.
    const setArg = upd.mock.calls[0]![1] as { $set?: Record<string, unknown> };
    expect(setArg.$set?.isDeleted).toBe(true);
  });
});
