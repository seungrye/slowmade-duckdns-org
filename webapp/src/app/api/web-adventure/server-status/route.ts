// /api/web-adventure/server-status - the owner-only server status proxy (#19).
//
// The webapp never touches the system directly. It proxies the local shim's read-only /api/system (CPU, RAM,
// disk, uptime, load) and /api/state (the active model) internally (127.0.0.1) and returns them.
// The status page's client polls every few seconds to keep the gauges live.

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
