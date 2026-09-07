// work_log's latest version (#261) - the app asks at startup.
//
// **The app decides whether it is a new version.** This only reports the latest value - if the site declared
// "you are out of date", the app would have to send its version every time, and there is no reason to distrust that value.
import { NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/db';
import { env } from '@/lib/env';
import WorkLogRelease from '@/models/work-log-release';

export async function GET(req: NextRequest) {
  const key = env.appKey.trim();
  if (!key) return NextResponse.json({ message: 'APP_KEY 미설정' }, { status: 503 });
  if (req.headers.get('x-app-key') !== key) {
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 });
  }

  await connectToDB();
  const latest = await WorkLogRelease.findOne({})
    .sort({ versionCode: -1 })
    .lean<{ versionCode: number; versionName: string; notes: string; size: number } | null>();

  // With nothing uploaded yet it answers "none" rather than 404 - there is no reason for the app to treat it
  // as an error and tell the user something is wrong.
  if (!latest) return NextResponse.json({ available: false });

  return NextResponse.json({
    available: true,
    versionCode: latest.versionCode,
    versionName: latest.versionName,
    notes: latest.notes,
    size: latest.size,
    apkUrl: `${env.siteUrl}/api/work-log/apk`,
  });
}
