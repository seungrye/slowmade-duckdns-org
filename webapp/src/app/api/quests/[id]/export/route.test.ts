import { describe, it, expect, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/lib/ron', () => ({ serializeRon: vi.fn(() => 'ron_content') }));
vi.mock('@/models/quest', () => ({
  default: { findById: vi.fn() },
}));

import { GET } from './route';
import Quest from '@/models/quest';

const params = Promise.resolve({ id: 'test-id' });
const req = new Request('http://localhost/api/quests/test-id/export') as unknown as NextRequest;

const baseQuest = {
  id: 'stark_quest',
  title: '스타크 퀘스트',
  giverNpc: 'eddard',
  initialPhase: 'phase_start',
  phases: { phase_start: { dialog: [], objective: null } },
  transitions: [],
  spawns: [],
};

describe('GET /api/quests/[id]/export', () => {
  it('ASCII id — Content-Disposition에 파일명이 올바르게 설정된다', async () => {
    vi.mocked(Quest.findById).mockReturnValue({ lean: () => ({ ...baseQuest, id: 'stark_quest' }) } as never);
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    const cd = res.headers.get('Content-Disposition');
    expect(cd).toContain("filename*=UTF-8''stark_quest.ron");
  });

  it('한글 id — ByteString 오류 없이 percent-encode된 파일명을 반환한다', async () => {
    vi.mocked(Quest.findById).mockReturnValue({ lean: () => ({ ...baseQuest, id: '스타크_퀘스트' }) } as never);
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    const cd = res.headers.get('Content-Disposition');
    expect(cd).toContain("filename*=UTF-8''");
    expect(cd).not.toContain('스타크');
  });

  it('퀘스트 없으면 404를 반환한다', async () => {
    vi.mocked(Quest.findById).mockReturnValue({ lean: () => null } as never);
    const res = await GET(req, { params });
    expect(res.status).toBe(404);
  });
});
