import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { env } from './env';

/**
 * owner 전용 라우트/페이지용 가드.
 *
 * - server component: `const owner = await requireOwner(); if (owner instanceof NextResponse) notFound();`
 * - API route: `if (owner instanceof NextResponse) return owner;`
 *
 * OWNER_EMAIL env 가 비어 있거나 session email 과 다르면 *존재 자체를 노출하지
 * 않도록* 401 대신 404 의도. API 는 NextResponse.json 으로 status 404 반환.
 */
export async function requireOwner(): Promise<{ email: string } | NextResponse> {
  const session = await auth();
  const expected = env.ownerEmail.trim();
  if (!expected || !session?.user?.email || session.user.email !== expected) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  return { email: session.user.email };
}

/** 현재 session 이 owner 인지 boolean 만 — UI 메뉴 노출 분기용. */
export async function isOwner(): Promise<boolean> {
  const session = await auth();
  const expected = env.ownerEmail.trim();
  return Boolean(expected && session?.user?.email === expected);
}
