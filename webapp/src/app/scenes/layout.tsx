// The Fall of Eternia's authoring tools - for the author alone (#179).
//
// A penetration test found the screens below this **open to anyone**. The game's content itself is public
// anyway (`/api/web-adventure/content/v1` serves it to the app), but the authoring tools are different -
// revision history, sentences still being worked on, per-run feedback notes: things
// that are not in the finished work are all visible.
//
// Why it is blocked in one layout: there are seven screens, and doing it per page means forgetting one when adding another.
// Here, every path under `/scenes` is covered automatically.
//
// `notFound()` is used - a 401 would itself say "that address exists". The middleware also cuts it off with a 404
// before it reaches here when there is no session cookie at all (a fast first guard).
import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/require-owner';

export default async function ScenesLayout({ children }: { children: React.ReactNode }) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) notFound();
  return <>{children}</>;
}
