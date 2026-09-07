import { NextRequest, NextResponse } from 'next/server';
import { env } from './env';

/**
 * The guard for the server's internal self-calls (/api/revalidate and the like).
 *
 * The `X-Internal-Token` header must match env.revalidateToken.
 * A mismatch, or an unset env, gives 404 - not even existence is revealed (consistent with the require-ingest-key pattern).
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
