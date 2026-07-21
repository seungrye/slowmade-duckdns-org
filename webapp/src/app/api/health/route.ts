// 무중단 배포 헬스체크 — deploy.sh 가 폴링.
//
// 기본: 가벼운 `{ok: true}` (인스턴스 응답성만).
// ?deep=true: mongo 연결 + admin ping 까지 검사 (DB 실패 인스턴스가 healthy 응답
//   하는 false positive 차단). 실패 시 503.

import { apiSuccess, apiError } from '@/lib/api-response';
import { connectToDB } from '@/lib/db';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const deep = url.searchParams.get('deep') === 'true';

  if (!deep) {
    return apiSuccess({ ok: true });
  }

  // 심층 — mongo 연결 + admin ping.
  try {
    await connectToDB();
    const admin = mongoose.connection.db?.admin();
    if (!admin) throw new Error('mongoose connection not ready');
    await admin.ping();
    return apiSuccess({ ok: true, mongo: 'ok' });
  } catch (e) {
    // 내부 에러 원문(DB 연결정보 등)은 로그로만 — 무인증 공개 엔드포인트라 응답엔 제네릭 메시지.
    console.error('[health] deep check failed:', e);
    return apiError('deep health check failed', 503);
  }
}
