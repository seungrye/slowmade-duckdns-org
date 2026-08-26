// work_log APK 내려주기 (#261) — 앱이 업데이트를 받을 때.
//
// MinIO 에서 흘려보낸다. **공개 URL 을 만들지 않는다** — 여기를 거쳐야 키를 확인할 수 있고,
// 보관 위치가 바뀌어도 앱이 보는 주소는 그대로다.
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

  // 통째로 메모리에 올리지 않고 흘려보낸다 — APK 가 수십 MB 다.
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': APK_MIME,
      'Content-Length': String(latest.size),
      // 안드로이드가 파일 이름을 알아야 설치 화면이 제대로 뜬다.
      'Content-Disposition': `attachment; filename="work-log-${latest.versionName}.apk"`,
      'Cache-Control': 'no-store',
    },
  });
}
