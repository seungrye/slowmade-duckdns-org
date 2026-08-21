import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { requireAiTeamKey } from '@/lib/require-ai-team-key';

/**
 * AI 팀 라우트 세 개가 공유하는 입구 (#207).
 *
 * 키를 확인하고 **주인이 누구인지** 돌려준다. 주인이 정해져 있지 않으면(OWNER_EMAIL 미설정)
 * 열어 줄 대상 자체가 없으므로 닫는다 — 이 값이 비면 `aiTeamPostFilter` 가 던지기도 하지만,
 * 500 을 내는 것보다 404 로 조용히 닫는 편이 낫다.
 *
 * 가드를 한 곳에 모은 이유는 규칙이 갈리지 않게 하기 위해서다. 라우트마다 따로 쓰면
 * 한쪽이 뒤처지고, 뒤처진 쪽이 뚫린다.
 */
export function requireAiTeam(req: NextRequest): { ownerEmail: string } | NextResponse {
  const denied = requireAiTeamKey(req);
  if (denied) return denied;

  const ownerEmail = env.ownerEmail.trim();
  if (!ownerEmail) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  return { ownerEmail };
}

/**
 * ObjectId 모양인가 — DB 에 닿기 전에 거른다.
 *
 * mongoose 는 형식이 틀린 id 를 받으면 CastError 를 **던진다**. 그대로 두면 잘못된 입력
 * 하나가 500 이 되고, 스택이 로그에 쌓인다. 형식 검사로 400 을 돌려주는 편이 낫다.
 */
export function isObjectIdLike(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{24}$/i.test(value);
}
