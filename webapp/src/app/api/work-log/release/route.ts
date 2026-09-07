// Uploading a work_log release (#261) - called by the release workflow.
//
// The work_log repo is private, so the app cannot see GitHub's releases API. The site therefore holds the latest
// APK and tells the app about it.
//
// Authentication is the shared app key (x-app-key) - the same way as Eternia's app-end-run.
// The APK goes into **MinIO**. Putting it in `public/` would 404 until a rebuild (a trap already met).
import { NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/db';
import { env } from '@/lib/env';
import { getMinioClient } from '@/lib/minio-client';
import WorkLogRelease from '@/models/work-log-release';
import { parseReleaseUpload } from '@/lib/work-log-release';

/** Always overwritten in the same place - only one copy is kept. */
const OBJECT_KEY = 'work-log/app-release.apk';

export async function POST(req: NextRequest) {
  const key = env.appKey.trim();
  // Without a key anyone could swap the APK - it is not left open (secure by default).
  if (!key) return NextResponse.json({ message: 'APP_KEY 미설정' }, { status: 503 });
  if (req.headers.get('x-app-key') !== key) {
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('apk');
  if (!form || !(file instanceof File)) {
    return NextResponse.json({ message: 'apk 파일이 필요합니다.' }, { status: 400 });
  }

  const parsed = parseReleaseUpload(
    {
      versionCode: form.get('versionCode'),
      versionName: form.get('versionName'),
      notes: form.get('notes'),
    },
    file.size,
  );
  if (!parsed) {
    return NextResponse.json({ message: 'versionCode·versionName·apk 를 확인하세요.' }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  await getMinioClient().putObject(env.minio.bucket, OBJECT_KEY, bytes, bytes.length, {
    'Content-Type': 'application/vnd.android.package-archive',
  });

  await connectToDB();
  // Only one is kept - always swapped for the latest.
  await WorkLogRelease.deleteMany({});
  await WorkLogRelease.create({ ...parsed, objectKey: OBJECT_KEY, size: bytes.length });

  return NextResponse.json({
    ok: true,
    versionCode: parsed.versionCode,
    versionName: parsed.versionName,
    size: bytes.length,
  });
}
