import { NextResponse } from 'next/server';
import { auth } from '@/auth';

/**
 * Used when an API route requires authentication.
 * On failure it returns a 401 NextResponse, so the caller returns early with
 * `if (result instanceof NextResponse) return result;`.
 */
export async function requireAuth(): Promise<{ email: string } | NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }
  return { email: session.user.email };
}
