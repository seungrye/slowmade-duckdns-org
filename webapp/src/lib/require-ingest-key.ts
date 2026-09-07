import { NextRequest, NextResponse } from 'next/server';
import { env } from './env';

/**
 * The /api/ingest guard for the stock-automator daemon.
 *
 * The `X-Ingest-Key` header must match env.stockIngestKey.
 * A mismatch, or an unset env, gives 404 - not even existence is revealed (consistent with the owner pattern).
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
