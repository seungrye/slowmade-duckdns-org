// work_log 손글씨 인식 자료 나눠 주기 (#415) — 앱이 자료를 받을 때.
//
// 앱이 손글씨 엔진을 MyScript iink 로 바꾸면서(seungrye/work_log#82) 인식 자료가 있어야
// 돌게 됐다. **최종 사용자가 MyScript 서버를 직접 치는 것을 약관이 막으므로** 우리가
// 얹어 두고 나눠 준다. 통로는 APK 와 같다 — MinIO 에 담고 x-app-key 로 잠그고 흘려보낸다.
//
// ── 올리는 길은 여기가 아니다 ────────────────────────────────────────
//
// 자료가 30MB 를 넘는데 이 도메인의 nginx 는 `client_max_body_size 16M` 이다. 올리는
// 끝점을 만들어 봐야 앞단에서 413 으로 막힌다. **MinIO 로 바로 올린다** —
// `minio-api.slowmade.duckdns.org` 는 크기 제한이 없다(`client_max_body_size 0`).
//
//   mc cp ko_KR.zip <별칭>/<버킷>/work-log/ink-assets/ko_KR.zip
//
// 자료 자체는 저장소에 안 들어간다. 남의 것이고 크다.
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
  // 키가 없으면 남의 것을 아무나 받아 간다 — 열어 두지 않는다(default secure).
  if (!key) return NextResponse.json({ message: 'APP_KEY 미설정' }, { status: 503 });
  if (req.headers.get('x-app-key') !== key) {
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 });
  }

  const { name } = await params;
  const objectKey = assetObjectKey(name);
  if (!objectKey) return NextResponse.json({ message: '이름이 올바르지 않습니다.' }, { status: 400 });

  const client = getMinioClient();
  // 크기를 먼저 묻는다 — 앱이 받은 몫을 보여 주려면 전체를 알아야 하고,
  // 없는 것을 흘려보내려다 터지는 것보다 404 로 말해 주는 편이 낫다.
  const stat = await client.statObject(env.minio.bucket, objectKey).catch(() => null);
  if (!stat) return NextResponse.json({ message: '아직 올라온 자료가 없습니다.' }, { status: 404 });

  const stream = await client.getObject(env.minio.bucket, objectKey);

  // 통째로 메모리에 올리지 않고 흘려보낸다 — 자료가 수십 MB 다.
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': ZIP_MIME,
      'Content-Length': String(stat.size),
      'Cache-Control': 'no-store',
    },
  });
}
