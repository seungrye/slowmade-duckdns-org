// /api/web-adventure/server-status — owner 전용 서버 상태 프록시 (#19).
//
// webapp 은 시스템을 직접 건드리지 않는다. 로컬 shim 의 read-only /api/system(CPU·RAM·
// 디스크·업타임·부하)·/api/state(활성 모델)를 내부(127.0.0.1)로 프록시해 반환만 한다.
// 상태 페이지 클라이언트가 수 초마다 폴링해 게이지를 실시간 갱신.

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/require-owner';
import { apiSuccess } from '@/lib/api-response';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

async function fetchJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const root = env.llmBaseUrl.replace(/\/v1\/?$/, '');
  const [system, state] = await Promise.all([
    fetchJson(`${root}/api/system`),
    fetchJson(`${root}/api/state`),
  ]);
  return apiSuccess({ system, state });
}
