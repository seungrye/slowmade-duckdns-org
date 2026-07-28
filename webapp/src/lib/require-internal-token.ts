import { NextRequest, NextResponse } from 'next/server';
import { env } from './env';

/**
 * 서버 내부 self-call 전용 가드(/api/revalidate 등).
 *
 * 헤더 `X-Internal-Token` 이 env.revalidateToken 과 일치해야 통과.
 * 불일치 또는 env 미설정 시 404 — 존재 자체 비노출 (require-ingest-key 패턴과 일관).
 */
export function requireInternalToken(req: NextRequest): NextResponse | null {
  const expected = env.revalidateToken.trim();
  if (!expected) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  const got = req.headers.get('x-internal-token') ?? '';
  if (got !== expected) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  return null;
}
