// AI 팀 API 키 가드 (#207).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockEnv = vi.hoisted(() => ({ aiTeamKey: '' }));
vi.mock('./env', () => ({ env: mockEnv }));

const { requireAiTeamKey } = await import('./require-ai-team-key');

function req(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/ai-team/threads', { headers });
}

describe('requireAiTeamKey', () => {
  beforeEach(() => {
    mockEnv.aiTeamKey = 'secret-key';
  });

  it('키가 맞으면 통과 — null 을 돌려준다', () => {
    expect(requireAiTeamKey(req({ 'x-ai-team-key': 'secret-key' }))).toBeNull();
  });

  it('키가 틀리면 404 — 존재 자체를 알려 주지 않는다', async () => {
    const res = requireAiTeamKey(req({ 'x-ai-team-key': 'wrong' }));
    expect(res?.status).toBe(404);
  });

  it('헤더가 없으면 404', () => {
    expect(requireAiTeamKey(req())?.status).toBe(404);
  });

  // (헤더 값의 앞뒤 공백은 HTTP 계층이 이미 제거하므로 우리가 볼 일이 아니다.)
  it('대소문자가 다르면 404 — 키 비교는 정확히 일치', () => {
    expect(requireAiTeamKey(req({ 'x-ai-team-key': 'SECRET-KEY' }))?.status).toBe(404);
  });

  it('키의 일부만 맞아도 404', () => {
    expect(requireAiTeamKey(req({ 'x-ai-team-key': 'secret' }))?.status).toBe(404);
    expect(requireAiTeamKey(req({ 'x-ai-team-key': 'secret-key-extra' }))?.status).toBe(404);
  });

  // env 가 비어 있는데 빈 헤더가 통과하면 배포 실수 하나로 문이 활짝 열린다.
  it('env 가 비어 있으면 어떤 요청도 막는다 (default secure)', () => {
    mockEnv.aiTeamKey = '';
    expect(requireAiTeamKey(req())?.status).toBe(404);
    expect(requireAiTeamKey(req({ 'x-ai-team-key': '' }))?.status).toBe(404);
    expect(requireAiTeamKey(req({ 'x-ai-team-key': 'anything' }))?.status).toBe(404);
  });
});
