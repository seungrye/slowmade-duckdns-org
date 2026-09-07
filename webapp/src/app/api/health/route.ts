// The zero-downtime deploy health check - polled by deploy.sh.
//
// By default: a light `{ok: true}` (the instance's responsiveness alone).
// ?deep=true: it also checks the mongo connection and an admin ping (blocking the false positive where an instance
//   with a broken DB answers healthy). A failure gives 503.

import { apiSuccess, apiError } from '@/lib/api-response';
import { connectToDB } from '@/lib/db';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const deep = url.searchParams.get('deep') === 'true';

  if (!deep) {
    return apiSuccess({ ok: true });
  }

  // Deep - the mongo connection plus an admin ping.
  try {
    await connectToDB();
    const admin = mongoose.connection.db?.admin();
    if (!admin) throw new Error('mongoose connection not ready');
    await admin.ping();
    return apiSuccess({ ok: true, mongo: 'ok' });
  } catch (e) {
    // The raw internal error (DB connection details and so on) stays in the log - being an unauthenticated public endpoint, the response carries a generic message.
    console.error('[health] deep check failed:', e);
    return apiError('deep health check failed', 503);
  }
}
