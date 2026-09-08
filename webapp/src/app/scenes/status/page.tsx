// /scenes/status - the owner-only server status (read-only, live gauges). (#9, #55, #19)
//
// The server component only gates on owner. The actual status is fetched by the client from /api/web-adventure/server-status
// every few seconds, refreshing the CPU and memory gauges, the load and the per-core figures live.
// The webapp never touches the system - it only displays the shim's read-only state.

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
