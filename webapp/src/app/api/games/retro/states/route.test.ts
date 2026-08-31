import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockPutObject = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockRemoveObject = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockUpdateOne = vi.hoisted(() => vi.fn());
const mockDeleteOne = vi.hoisted(() => vi.fn());
const mockFindOne = vi.hoisted(() => vi.fn());
const mockRomExists = vi.hoisted(() => vi.fn());

vi.hoisted(() => {
  process.env.MINIO_ENDPOINT = 'test-endpoint.com';
  process.env.MINIO_ACCESSKEY = 'test-key';
  process.env.MINIO_SECRETKEY = 'test-secret';
  process.env.MINIO_BUCKET = 'test-bucket';
});

vi.mock('@/lib/achievements', () => ({ evaluateAndGrant: vi.fn().mockResolvedValue([]) }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn().mockResolvedValue(undefined) }));
vi.mock('minio', () => ({
  Client: class {
    putObject = mockPutObject;
    removeObject = mockRemoveObject;
  },
}));
vi.mock('@/models/retro-rom', () => ({ default: { exists: mockRomExists } }));
vi.mock('@/models/retro-save-state', () => ({
  default: { updateOne: mockUpdateOne, deleteOne: mockDeleteOne, findOne: mockFindOne },
}));

import { GET, PUT, DELETE } from './route';
import { MAX_STATE_BYTES } from '@/lib/retro/save-state-access';
import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { BUILTIN_GAMES } from '@/lib/retro/library';

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const ROM_ID = '653f1a2b3c4d5e6f70819202';
const BUILTIN = `builtin:${BUILTIN_GAMES[0].slug}`;

function req(method: string, query = '', body?: FormData): NextRequest {
  return new Request(`http://localhost/api/games/retro/states${query}`, { method, body }) as NextRequest;
}

function stateForm(game: string, size = 1024, withShot = true): FormData {
  const f = new FormData();
  f.set('game', game);
  f.set('state', new File([new Uint8Array(size)], 'x.state'));
  if (withShot) f.set('shot', new File([new Uint8Array(64)], 'x.png', { type: 'image/png' }));
  return f;
}

function findOneReturns(doc: unknown) {
  mockFindOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(doc) }) });
}

describe('/api/games/retro/states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { email: 'me@test.com' } });
    mockRomExists.mockResolvedValue({ _id: ROM_ID });
    mockPutObject.mockResolvedValue(undefined);
    mockUpdateOne.mockResolvedValue({ acknowledged: true });
    mockDeleteOne.mockResolvedValue({ deletedCount: 1 });
    findOneReturns(null);
  });

  describe('PUT — 저장', () => {
    it('로그인하지 않으면 401', async () => {
      mockAuth.mockResolvedValue(null);
      expect((await PUT(req('PUT', '', stateForm(BUILTIN)))).status).toBe(401);
      expect(mockPutObject).not.toHaveBeenCalled();
    });

    it('기본 제공 게임 키로 저장한다', async () => {
      const res = await PUT(req('PUT', '', stateForm(BUILTIN)));
      expect(res.status).toBe(200);
      // 상태 + 스크린샷 둘 다 올라간다.
      expect(mockPutObject).toHaveBeenCalledTimes(2);
      expect(mockPutObject.mock.calls[0][1]).toMatch(/^retro-states\/[0-9a-f-]{36}\.state$/);

      const [filter, update, opts] = mockUpdateOne.mock.calls[0];
      expect(filter).toEqual({ userEmail: 'me@test.com', gameKey: BUILTIN });
      expect(opts).toEqual({ upsert: true });
      expect(update.$set.size).toBe(1024);
    });

    it('내 롬 키로 저장한다', async () => {
      expect((await PUT(req('PUT', '', stateForm(`rom:${ROM_ID}`)))).status).toBe(200);
      expect(mockRomExists).toHaveBeenCalledWith({
        _id: ROM_ID,
        userEmail: 'me@test.com',
        isDeleted: { $ne: true },
      });
    });

    it('남의 롬 키로는 저장할 수 없다', async () => {
      mockRomExists.mockResolvedValue(null);
      expect((await PUT(req('PUT', '', stateForm(`rom:${ROM_ID}`)))).status).toBe(404);
      expect(mockPutObject).not.toHaveBeenCalled();
    });

    it.each([
      ['builtin:없는게임', '매니페스트에 없는 slug'],
      ['rom:not-an-id', 'id 형식 아님'],
      ['아무거나', '형식 아님'],
    ])('%s 는 거부한다 (%s) — 무료 파일 저장소가 되면 안 된다', async (key) => {
      expect((await PUT(req('PUT', '', stateForm(key)))).status).toBe(404);
      expect(mockPutObject).not.toHaveBeenCalled();
    });

    it('상태가 없으면 400', async () => {
      const f = new FormData();
      f.set('game', BUILTIN);
      expect((await PUT(req('PUT', '', f))).status).toBe(400);
    });

    it('한도를 넘으면 413', async () => {
      expect((await PUT(req('PUT', '', stateForm(BUILTIN, MAX_STATE_BYTES + 1)))).status).toBe(413);
      expect(mockPutObject).not.toHaveBeenCalled();
    });

    it('스크린샷이 없어도 저장된다', async () => {
      expect((await PUT(req('PUT', '', stateForm(BUILTIN, 512, false)))).status).toBe(200);
      expect(mockPutObject).toHaveBeenCalledTimes(1);
    });

    it('기록이 실패하면 올린 오브젝트를 모두 지운다', async () => {
      mockUpdateOne.mockRejectedValue(new Error('db down'));
      expect((await PUT(req('PUT', '', stateForm(BUILTIN)))).status).toBe(500);
      expect(mockRemoveObject).toHaveBeenCalledTimes(2);
    });
  });

  describe('GET — 메타', () => {
    it('저장이 없으면 null 을 준다 — 오류가 아니다', async () => {
      const body = await (await GET(req('GET', `?game=${encodeURIComponent(BUILTIN)}`))).json();
      expect(body.data).toBeNull();
    });

    it('있으면 시각·크기를 주고 오브젝트 키는 감춘다', async () => {
      findOneReturns({ size: 4096, shotKey: 'retro-states/secret.shot', updatedAt: new Date(0) });
      const body = await (await GET(req('GET', `?game=${encodeURIComponent(BUILTIN)}`))).json();
      expect(body.data).toEqual({ size: 4096, hasShot: true, updatedAt: '1970-01-01T00:00:00.000Z' });
      expect(JSON.stringify(body)).not.toContain('secret');
    });

    it('이상한 키는 404', async () => {
      expect((await GET(req('GET', '?game=아무거나'))).status).toBe(404);
    });
  });

  describe('DELETE', () => {
    it('진짜 지운다 — 플래그를 세우면 다음 저장이 유니크 인덱스와 부딪힌다', async () => {
      const res = await DELETE(req('DELETE', `?game=${encodeURIComponent(BUILTIN)}`));
      expect(res.status).toBe(200);
      expect(mockDeleteOne).toHaveBeenCalledWith({ userEmail: 'me@test.com', gameKey: BUILTIN });
    });

    it('저장이 없으면 404', async () => {
      mockDeleteOne.mockResolvedValue({ deletedCount: 0 });
      expect((await DELETE(req('DELETE', `?game=${encodeURIComponent(BUILTIN)}`))).status).toBe(404);
    });

    it('로그인하지 않으면 401', async () => {
      mockAuth.mockResolvedValue(null);
      expect((await DELETE(req('DELETE', `?game=${encodeURIComponent(BUILTIN)}`))).status).toBe(401);
      expect(mockDeleteOne).not.toHaveBeenCalled();
    });
  });
});
