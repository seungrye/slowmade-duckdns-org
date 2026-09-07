// The work_log diagnostics upload (#409) - the app calls it the next time it opens after dying.
//
// Authentication is the same shared app key as the release upload (x-app-key).
//
// **It is not excluded from the middleware matcher.** Unlike #407, where the APK was truncated at 10MB,
// this body is capped at 1MB and never reaches that wall. Excluding it with nothing to gain would only lose the
// security headers - so it stays.
import { NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/db';
import { env } from '@/lib/env';
import WorkLogDiag from '@/models/work-log-diag';
import { parseDiagUpload } from '@/lib/work-log-diag';

/** How many sets to keep. Enough to see a recurring pattern. */
const KEEP = 20;

export async function POST(req: NextRequest) {
  const key = env.appKey.trim();
  // Without a key anyone could pile things in - it is not left open (secure by default).
  if (!key) return NextResponse.json({ message: 'APP_KEY 미설정' }, { status: 503 });
  if (req.headers.get('x-app-key') !== key) {
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = json && parseDiagUpload(json);
  if (!parsed) {
    return NextResponse.json({ message: '진단 글이 비었거나 너무 큽니다.' }, { status: 400 });
  }

  await connectToDB();
  const saved = await WorkLogDiag.create(parsed);

  // Prunes the old ones. **What was just inserted is never pruned** - the most recent KEEP sets are kept.
  const 남길것 = await WorkLogDiag.find({}, { _id: 1 })
    .sort({ createdAt: -1 })
    .limit(KEEP)
    .lean<{ _id: unknown }[]>();
  await WorkLogDiag.deleteMany({ _id: { $nin: 남길것.map((d) => d._id) } });

  return NextResponse.json({ ok: true, id: String(saved._id) });
}
