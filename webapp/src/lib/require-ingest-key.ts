import { NextRequest, NextResponse } from 'next/server';
import { env } from './env';

/**
 * stock-automator 데몬용 /api/ingest 가드.
 *
 * 헤더 `X-Ingest-Key` 가 env.stockIngestKey 와 일치해야 통과.
 * 불일치 또는 env 미설정 시 404 — 존재 자체 비노출 (owner pattern 과 일관).
 */
export function requireIngestKey(req: NextRequest): NextResponse | null {
  const expected = env.stockIngestKey.trim();
  if (!expected) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  const got = req.headers.get('x-ingest-key') ?? '';
  if (got !== expected) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  return null;
}
