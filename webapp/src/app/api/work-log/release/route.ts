// work_log 릴리스 올리기 (#261) — 릴리스 워크플로가 부른다.
//
// work_log 저장소가 비공개라 앱이 GitHub 릴리스 API 를 못 본다. 그래서 사이트가 최신
// APK 를 들고 있다가 앱에 알려 준다.
//
// 인증은 공유 앱 키(x-app-key) — 에테르니아 app-end-run 과 같은 방식이다.
// APK 는 **MinIO** 에 담는다. `public/` 에 두면 새 파일이 재빌드 전까지 404 다(겪은 함정).
import { NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/db';
import { env } from '@/lib/env';
import { getMinioClient } from '@/lib/minio-client';
import WorkLogRelease from '@/models/work-log-release';
import { parseReleaseUpload } from '@/lib/work-log-release';

/** 늘 같은 자리에 덮어쓴다 — 한 벌만 보관한다. */
const OBJECT_KEY = 'work-log/app-release.apk';

export async function POST(req: NextRequest) {
  const key = env.appKey.trim();
  // 키가 없으면 아무나 APK 를 갈아 끼울 수 있다 — 열어 두지 않는다(default secure).
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
  // 한 벌만 둔다 — 늘 최신으로 갈아 끼운다.
  await WorkLogRelease.deleteMany({});
  await WorkLogRelease.create({ ...parsed, objectKey: OBJECT_KEY, size: bytes.length });

  return NextResponse.json({
    ok: true,
    versionCode: parsed.versionCode,
    versionName: parsed.versionName,
    size: bytes.length,
  });
}
