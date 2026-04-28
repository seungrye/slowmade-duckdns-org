import { NextResponse } from 'next/server';
import { auth } from '@/auth';

/**
 * API 라우트에서 인증을 요구할 때 사용한다.
 * 인증 실패 시 401 NextResponse를 반환하므로 호출부에서
 * `if (result instanceof NextResponse) return result;` 로 조기 반환한다.
 */
export async function requireAuth(): Promise<{ email: string } | NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }
  return { email: session.user.email };
}
