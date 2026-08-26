// work_log 최신 버전 (#261) — 앱이 시작할 때 묻는다.
//
// **새 버전인지 판단하는 것은 앱이다.** 여기서는 최신값만 알려 준다 — 사이트가 "당신은
// 구버전"이라고 정하면 앱 버전을 매번 올려 보내야 하고, 그 값을 못 믿을 이유도 없다.
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

  // 아직 올린 것이 없으면 404 가 아니라 "없음"으로 답한다 — 앱이 오류로 보고
  // 사용자에게 뭔가 잘못됐다고 알릴 이유가 없다.
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
