// work_log 진단 올리기 (#409) — 앱이 죽은 뒤 다음에 열릴 때 부른다.
//
// 인증은 릴리스 올리기와 같은 공유 앱 키(x-app-key).
//
// **middleware matcher 에서 빼지 않았다.** #407 에서 APK 가 10MB 에 걸려 잘렸던 것과 달리
// 이 본문은 1MB 상한이라 그 벽에 안 닿는다. 뺄 이유가 없는데 빼면 얻는 것 없이 보안 헤더만
// 사라진다 — 그래서 그대로 둔다.
import { NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/db';
import { env } from '@/lib/env';
import WorkLogDiag from '@/models/work-log-diag';
import { parseDiagUpload } from '@/lib/work-log-diag';

/** 남겨 둘 벌 수. 되풀이되는 흐름을 보기에 넉넉하다. */
const KEEP = 20;

export async function POST(req: NextRequest) {
  const key = env.appKey.trim();
  // 키가 없으면 아무나 쌓아 넣을 수 있다 — 열어 두지 않는다(default secure).
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

  // 오래된 것을 걷는다. **방금 넣은 것은 절대 안 걷는다** — 최근 KEEP 벌을 남긴다.
  const 남길것 = await WorkLogDiag.find({}, { _id: 1 })
    .sort({ createdAt: -1 })
    .limit(KEEP)
    .lean<{ _id: unknown }[]>();
  await WorkLogDiag.deleteMany({ _id: { $nin: 남길것.map((d) => d._id) } });

  return NextResponse.json({ ok: true, id: String(saved._id) });
}
