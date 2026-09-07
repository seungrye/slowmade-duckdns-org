// Serving work_log's handwriting recognition assets (#415) - when the app fetches them.
//
// Moving the app's handwriting engine to MyScript iink (seungrye/work_log#82) made the recognition assets
// necessary to run. **The terms forbid an end user hitting MyScript's servers directly**, so we host and
// serve them. The channel is the same as the APK's - stored in MinIO, locked behind x-app-key and streamed.
//
// ── The upload path is not here ────────────────────────────────────────
//
// The assets exceed 30MB while this domain's nginx has `client_max_body_size 16M`. An upload endpoint would
// simply be blocked with a 413 at the edge. **Upload straight to MinIO** -
// `minio-api.slowmade.duckdns.org` has no size limit (`client_max_body_size 0`).
//
//   mc cp ko_KR.zip <alias>/<bucket>/work-log/ink-assets/ko_KR.zip
//
// The assets themselves are not in the repo. They belong to someone else and they are large.
import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { getMinioClient } from '@/lib/minio-client';
import { assetObjectKey } from '@/lib/work-log-ink-assets';

interface Params {
  params: Promise<{ name: string }>;
}

const ZIP_MIME = 'application/zip';

export async function GET(req: NextRequest, { params }: Params) {
  const key = env.appKey.trim();
  // Without a key anyone could download someone else's assets - it is not left open (secure by default).
  if (!key) return NextResponse.json({ message: 'APP_KEY 미설정' }, { status: 503 });
  if (req.headers.get('x-app-key') !== key) {
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 });
  }

  const { name } = await params;
  const objectKey = assetObjectKey(name);
  if (!objectKey) return NextResponse.json({ message: '이름이 올바르지 않습니다.' }, { status: 400 });

  const client = getMinioClient();
  // The size is asked first - the app needs the total to show how much it has received, and
  // saying 404 beats blowing up part-way through streaming something that is not there.
  const stat = await client.statObject(env.minio.bucket, objectKey).catch(() => null);
  if (!stat) return NextResponse.json({ message: '아직 올라온 자료가 없습니다.' }, { status: 404 });

  const stream = await client.getObject(env.minio.bucket, objectKey);

  // It streams rather than loading the whole thing into memory - the assets are tens of MB.
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': ZIP_MIME,
      'Content-Length': String(stat.size),
      'Cache-Control': 'no-store',
    },
  });
}
