// Serving the work_log APK (#261) - when the app fetches an update.
//
// It streams from MinIO. **No public URL is created** - going through here is what lets the key be checked, and
// the address the app sees stays the same even if the storage location changes.
import { NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/db';
import { env } from '@/lib/env';
import { getMinioClient } from '@/lib/minio-client';
import WorkLogRelease from '@/models/work-log-release';
import { APK_MIME } from '@/lib/work-log-release';

export async function GET(req: NextRequest) {
  const key = env.appKey.trim();
  if (!key) return NextResponse.json({ message: 'APP_KEY 미설정' }, { status: 503 });
  if (req.headers.get('x-app-key') !== key) {
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 });
  }

  await connectToDB();
  const latest = await WorkLogRelease.findOne({})
    .sort({ versionCode: -1 })
    .lean<{ objectKey: string; size: number; versionName: string } | null>();
  if (!latest) return NextResponse.json({ message: '올라온 릴리스가 없습니다.' }, { status: 404 });

  const stream = await getMinioClient().getObject(env.minio.bucket, latest.objectKey);

  // It streams rather than loading the whole thing into memory - an APK is tens of MB.
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': APK_MIME,
      'Content-Length': String(latest.size),
      // Android needs the filename for the install screen to appear properly.
      'Content-Disposition': `attachment; filename="work-log-${latest.versionName}.apk"`,
      'Cache-Control': 'no-store',
    },
  });
}
