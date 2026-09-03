// /api/fortune/today — 오늘의 운세(타로) 조회, 없으면 생성 (#388).
//
// GET: 로그인 사용자의 오늘(KST) 문서를 get-or-create.
//   없으면 결정론 카드(draw) + 템플릿 풀이로 즉시 생성(status='pending') → 밤 배치가 LLM 으로 교체.
//   그래서 신규/휴면 사용자도 30초 대기 없이 바로 카드와 그럴듯한 풀이를 본다.
// 로그인 스코프(session.user.email)라 IDOR 없음.

import { apiSuccess, apiError } from "@/lib/api-response";
import { connectToDB } from "@/lib/db";
import { auth } from "@/auth";
import { env } from "@/lib/env";
import { buildPublicUrl } from "@/app/api/upload/upload.utils";
import DailyFortune from "@/models/daily-fortune";
import { seoulDateKey } from "@/lib/birthday";
import { drawDailyCard } from "@/lib/fortune/draw";
import { cardById } from "@/lib/fortune/tarot-deck";
import { templateReading } from "@/lib/fortune/reading";
import { fortuneDTO } from "@/lib/fortune/dto";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return apiError("로그인이 필요합니다.", 401);

  await connectToDB();
  const dateKey = seoulDateKey(new Date());

  let doc = await DailyFortune.findOne({ userEmail: email, dateKey }).lean();
  if (!doc) {
    const { cardId, orientation } = drawDailyCard(email, dateKey);
    const card = cardById(cardId)!;
    try {
      // upsert 로 동시요청 경쟁을 흡수(같은 사용자 두 탭). 유니크 인덱스가 중복을 막는다.
      await DailyFortune.updateOne(
        { userEmail: email, dateKey },
        {
          $setOnInsert: {
            userEmail: email, dateKey, cardId, orientation,
            reading: templateReading(card, orientation),
            readingSource: "template", status: "pending", seenAt: null,
          },
        },
        { upsert: true },
      );
    } catch {
      // 경쟁 삽입 충돌(E11000) — 아래 재조회가 승자 문서를 집는다.
    }
    doc = await DailyFortune.findOne({ userEmail: email, dateKey }).lean();
  }
  if (!doc) return apiError("운세를 불러오지 못했습니다.", 500);

  const card = cardById(doc.cardId);
  if (!card) return apiError("운세 카드를 찾을 수 없습니다.", 500);
  const imageUrl = buildPublicUrl(env.minio.publicHost, env.minio.bucket, card.image);
  return apiSuccess(fortuneDTO(doc, card, imageUrl));
}
