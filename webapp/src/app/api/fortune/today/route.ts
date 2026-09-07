// /api/fortune/today - reads today's fortune (tarot), creating it when absent (#388).
//
// GET: get-or-create the logged-in user's document for today (KST).
//   When absent it creates one at once from the deterministic card (draw) plus a template reading (status='pending') -> the nightly batch replaces it with the LLM's.
//   So a new or dormant user sees a card and a plausible reading immediately, with no 30-second wait.
// Scoped to the login (session.user.email), so there is no IDOR.

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
import User from "@/models/user";
import { computeSaju, todayIljin, sajuBlock } from "@/lib/fortune/saju";

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
      // The upsert absorbs concurrent requests (the same user in two tabs). A unique index prevents duplicates.
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
  const dto = fortuneDTO(doc, card, imageUrl);

  // The saju block - only with a birthday. The chart and day stem are recomputed every time (deterministic); only the LLM reading comes from the doc.
  const user = await User.findOne({ email }).select("birthday birthTime").lean<{ birthday?: Date; birthTime?: string | null } | null>();
  const saju = user?.birthday
    ? sajuBlock(
        computeSaju(new Date(user.birthday), user.birthTime),
        todayIljin(new Date()).pillar,
        { sajuReading: doc.sajuReading, sajuSource: doc.sajuSource },
      )
    : null;

  return apiSuccess({ ...dto, saju });
}
