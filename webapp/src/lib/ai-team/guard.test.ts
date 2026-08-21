// AI 팀 라우트 공통 가드 (#207).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockEnv = vi.hoisted(() => ({ aiTeamKey: '', ownerEmail: '' }));
vi.mock('@/lib/env', () => ({ env: mockEnv }));

const { requireAiTeam, isObjectIdLike } = await import('./guard');

function req(key?: string) {
  return new NextRequest('http://localhost/api/ai-team/threads', {
    headers: key === undefined ? {} : { 'x-ai-team-key': key },
  });
}

describe('requireAiTeam', () => {
  beforeEach(() => {
    mockEnv.aiTeamKey = 'secret-key';
    mockEnv.ownerEmail = 'owner@x.test';
  });

  it('키가 맞으면 주인 이메일을 돌려준다', () => {
    expect(requireAiTeam(req('secret-key'))).toEqual({ ownerEmail: 'owner@x.test' });
  });

  it('키가 틀리면 404', () => {
    const res = requireAiTeam(req('wrong'));
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(404);
  });

  // 주인이 정해지지 않은 배포에서 문이 열리면 안 된다 — 열어 줄 대상이 없으니 닫는다.
  it('OWNER_EMAIL 이 비어 있으면 키가 맞아도 404', () => {
    mockEnv.ownerEmail = '';
    const res = requireAiTeam(req('secret-key'));
    expect((res as NextResponse).status).toBe(404);
  });

  it('AI_TEAM_KEY 가 비어 있으면 404 (default secure)', () => {
    mockEnv.aiTeamKey = '';
    expect((requireAiTeam(req()) as NextResponse).status).toBe(404);
  });
});

describe('isObjectIdLike', () => {
  it('24자리 16진수만 통과', () => {
    expect(isObjectIdLike('507f1f77bcf86cd799439011')).toBe(true);
    expect(isObjectIdLike('507F1F77BCF86CD799439011')).toBe(true);
  });

  // mongoose 는 형식이 틀린 id 에 CastError 를 던진다 — DB 에 닿기 전에 걸러야 500 이 안 된다.
  it('형식이 다르면 거부', () => {
    expect(isObjectIdLike('')).toBe(false);
    expect(isObjectIdLike('507f1f77bcf86cd79943901')).toBe(false); // 23자
    expect(isObjectIdLike('507f1f77bcf86cd7994390111')).toBe(false); // 25자
    expect(isObjectIdLike('507f1f77bcf86cd79943901g')).toBe(false); // 16진수 아님
    expect(isObjectIdLike(null)).toBe(false);
    expect(isObjectIdLike(undefined)).toBe(false);
    expect(isObjectIdLike(123)).toBe(false);
    expect(isObjectIdLike({ $ne: null })).toBe(false); // 연산자 주입
  });
});
