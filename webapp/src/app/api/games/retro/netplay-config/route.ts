// /api/games/retro/netplay-config - the netplay settings the player reads just before booting (#186).
//
// Why they are not passed as URL parameters: the ICE list can contain **TURN credentials**, and putting them in a URL
// leaves them in the browser history, the referrer and the server logs. They are served only to an authorised request.
//
// Any logged-in user receives them (#188) - two accounts that each uploaded the same ROM must be able to play together.
// The signalling path (`/netplay/`) is gated on the same basis in nginx.

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { env } from '@/lib/env';

export async function GET() {
  const authed = await requireAuth();
  if (authed instanceof NextResponse) return authed;

  if (!env.netplay.enabled) {
    return NextResponse.json({ message: 'netplay 가 꺼져 있습니다. (RETRO_NETPLAY 미설정)' }, { status: 503 });
  }

  // When empty, EmulatorJS warns in the console that "it only connects on the same LAN" (measured). It still works,
  // so it is not blocked - for two PCs in one house this is enough.
  let iceServers: unknown[] = [];
  const raw = env.netplay.iceServers.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) iceServers = parsed;
      else console.error('RETRO_NETPLAY_ICE_SERVERS 가 배열이 아닙니다 — 무시합니다.');
    } catch (err) {
      // Broken settings do not block play. It still connects within a LAN.
      console.error('RETRO_NETPLAY_ICE_SERVERS 를 읽지 못했습니다 — 같은 랜에서만 붙습니다.', err);
    }
  }

  return NextResponse.json(
    { iceServers },
    // It can contain credentials - never leave it in an intermediate cache.
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
