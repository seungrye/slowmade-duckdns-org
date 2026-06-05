// /api/web-adventure/migrate-from-local — 비로그인 → 로그인 시 localStorage 데이터 서버 이전 (#240).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/models/web-adventure-save', () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
}));
vi.mock('@/models/web-adventure-past-run', () => ({
  default: { insertMany: vi.fn(), find: vi.fn() },
}));

import { POST } from './route';
import WebAdventureSave from '@/models/web-adventure-save';
import WebAdventurePastRun from '@/models/web-adventure-past-run';
import { auth } from '@/auth';

function makeRequest(body: object): NextRequest {
  return new Request('http://localhost/api/web-adventure/migrate-from-local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const sampleSave = {
  runIndex: 2,
  currentSceneId: 'cave_entry',
  character: {
    stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
    hp: 8,
    maxHp: 10,
    ability: 'scholar',
    inventory: ['torch'],
    flags: {},
    rerollsLeft: 2,
  },
};

const samplePastRuns = [
  {
    runIndex: 1,
    endingId: 'main',
    finalSceneId: 'elder_house_ending',
    character: sampleSave.character,
    completedAt: new Date().toISOString(),
  },
];

describe('POST /api/web-adventure/migrate-from-local', () => {
  beforeEach(() => vi.clearAllMocks());

  it('비로그인 → 401', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(makeRequest({ save: sampleSave }));
    expect(res.status).toBe(401);
  });

  it('payload 없음 (save/pastRuns 둘 다 미포함) → 400', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'a@b.com' } });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('서버 save 없음 + save 전달 → upsert + migrated:true', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'a@b.com' } });
    (WebAdventureSave.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    (WebAdventureSave.findOneAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const res = await POST(makeRequest({ save: sampleSave }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.migrated).toBe(true);
    expect(WebAdventureSave.findOneAndUpdate).toHaveBeenCalled();
  });

  it('서버 save 있음 + mode 미지정 → migrated:false + reason="server_exists"', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'a@b.com' } });
    (WebAdventureSave.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ...sampleSave, userEmail: 'a@b.com' }),
    });
    const res = await POST(makeRequest({ save: sampleSave }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.migrated).toBe(false);
    expect(body.data.reason).toBe('server_exists');
    expect(WebAdventureSave.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('서버 save 있음 + mode="force" → 덮어쓰기 + migrated:true', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'a@b.com' } });
    (WebAdventureSave.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ...sampleSave, userEmail: 'a@b.com' }),
    });
    (WebAdventureSave.findOneAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const res = await POST(makeRequest({ save: sampleSave, mode: 'force' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.migrated).toBe(true);
    expect(WebAdventureSave.findOneAndUpdate).toHaveBeenCalled();
  });

  it('pastRuns 가 있으면 insertMany 호출 (이미 있는 runIndex 는 skip)', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'a@b.com' } });
    (WebAdventureSave.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    (WebAdventurePastRun.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([]), // 서버에 기존 past_run 없음
    });
    (WebAdventurePastRun.insertMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (WebAdventureSave.findOneAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const res = await POST(makeRequest({ save: sampleSave, pastRuns: samplePastRuns }));
    expect(res.status).toBe(200);
    expect(WebAdventurePastRun.insertMany).toHaveBeenCalled();
  });
});
