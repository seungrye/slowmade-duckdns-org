// /api/games/retro/netplay-config — 플레이어가 부팅 직전에 읽는 netplay 설정 (#186).
//
// URL 파라미터로 넘기지 않는 이유: ICE 목록에 **TURN 자격증명**이 들어갈 수 있는데, URL 에
// 실으면 브라우저 기록·리퍼러·서버 로그에 그대로 남는다. 인가된 요청으로만 내려준다.
//
// 로그인 사용자면 받는다 (#188) — 같은 롬을 각자 올린 다른 계정끼리도 함께 할 수 있어야 한다.
// 시그널링 경로(`/netplay/`)도 nginx 에서 같은 기준으로 막혀 있다.

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { env } from '@/lib/env';

export async function GET() {
  const authed = await requireAuth();
  if (authed instanceof NextResponse) return authed;

  if (!env.netplay.enabled) {
    return NextResponse.json({ message: 'netplay 가 꺼져 있습니다. (RETRO_NETPLAY 미설정)' }, { status: 503 });
  }

  // 비어 있으면 EmulatorJS 가 "같은 랜에서만 붙는다"고 콘솔에 경고한다(실측). 그래도 동작은
  // 하므로 막지 않는다 — 집 안의 두 PC 라면 이대로 충분하다.
  let iceServers: unknown[] = [];
  const raw = env.netplay.iceServers.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) iceServers = parsed;
      else console.error('RETRO_NETPLAY_ICE_SERVERS 가 배열이 아닙니다 — 무시합니다.');
    } catch (err) {
      // 설정이 깨졌다고 대전을 막지는 않는다. 랜 안에서는 여전히 붙는다.
      console.error('RETRO_NETPLAY_ICE_SERVERS 를 읽지 못했습니다 — 같은 랜에서만 붙습니다.', err);
    }
  }

  return NextResponse.json(
    { iceServers },
    // 자격증명이 섞일 수 있다 — 중간 캐시에 남기지 않는다.
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
