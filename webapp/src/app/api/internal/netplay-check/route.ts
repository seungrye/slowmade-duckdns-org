// /api/internal/netplay-check - for nginx's `auth_request` only (#186, #188).
//
// Leaving the netplay signalling server (`/netplay/`) open would let **anyone, even logged out**, connect.
// nginx asks here on every request and lets it through only on a 200. A socket.io handshake is an ordinary HTTP
// request in the end, so it is caught by this check too.
//
// **Any logged-in user passes, not just the owner** (#188). Two accounts that each uploaded the same ROM must be able
// to play together, so it cannot be owner-only. Rooms are separated by the ROM's bytes, so only people with the same
// ROM land in the same room.
//
// **No body is returned.** nginx's auth_request looks only at the status code (the body is discarded).
// Sending one anyway would leak information while being used nowhere.
//
// The browser connects same-origin, so the session cookie comes along - which is what makes this approach work.

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';

export async function GET() {
  const authed = await requireAuth();
  // The helper returns its own response shape on failure, but the auth_request convention requires a 401
  // (nginx treats only 401 and 403 as "authorisation failed" and everything else as a 500).
  if (authed instanceof NextResponse) return new NextResponse(null, { status: 401 });
  return new NextResponse(null, { status: 200 });
}
