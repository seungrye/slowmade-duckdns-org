// /api/fortune/seen — 오늘의 운세 열람 표시 (#388).
//
// POST: 오늘(KST) 문서의 seenAt 을 기록(멱등). 우하단 토스트가 열리거나 닫힐 때 호출한다.
//   seenAt 이 **하루 1회 판정의 서버 필드** — 이 값이 있으면 토스트가 다시 뜨지 않는다.
// 로그인 스코프라 남의 문서를 건드릴 수 없다.

import { apiSuccess, apiError } from "@/lib/api-response";
import { connectToDB } from "@/lib/db";
import { auth } from "@/auth";
import DailyFortune from "@/models/daily-fortune";
import { seoulDateKey } from "@/lib/birthday";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return apiError("로그인이 필요합니다.", 401);

  await connectToDB();
  const dateKey = seoulDateKey(new Date());
  // 이미 본 경우는 덮어쓰지 않는다(처음 본 시각을 보존) — seenAt: null 조건으로 멱등.
  await DailyFortune.updateOne(
    { userEmail: email, dateKey, seenAt: null },
    { $set: { seenAt: new Date() } },
  );
  return apiSuccess({ ok: true });
}
