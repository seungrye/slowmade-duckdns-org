// /scenes/status — owner 전용 서버 상태 (읽기 전용, 실시간 게이지). (#9, #55, #19)
//
// 서버 컴포넌트는 owner 게이팅만. 실제 상태는 클라이언트가 /api/web-adventure/server-status
// 를 수 초마다 폴링해 CPU/메모리 게이지·부하·코어별을 실시간 갱신한다.
// webapp 은 시스템 무접촉 — shim 의 read-only 상태를 표시만.

import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/require-owner';
import ServerStatusClient from './status-client';

export const dynamic = 'force-dynamic';

export default async function ServerStatusPage() {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) notFound();
  return <ServerStatusClient />;
}
