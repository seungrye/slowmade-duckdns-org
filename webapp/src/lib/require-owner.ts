import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { env } from './env';

/**
 * The guard for owner-only routes and pages.
 *
 * - server component: `const owner = await requireOwner(); if (owner instanceof NextResponse) notFound();`
 * - API route: `if (owner instanceof NextResponse) return owner;`
 *
 * When the OWNER_EMAIL env is empty or differs from the session email it intends a 404 rather than a 401, *so that
 * existence itself is not revealed*. The API returns status 404 through NextResponse.json.
 */
export async function requireOwner(): Promise<{ email: string } | NextResponse> {
  const session = await auth();
  const expected = env.ownerEmail.trim();
  if (!expected || !session?.user?.email || session.user.email !== expected) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  return { email: session.user.email };
}

/** Just a boolean for whether the current session is the owner - for showing or hiding UI menus. */
export async function isOwner(): Promise<boolean> {
  const session = await auth();
  const expected = env.ownerEmail.trim();
  return Boolean(expected && session?.user?.email === expected);
}
