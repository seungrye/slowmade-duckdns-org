import { NextResponse } from "next/server";
import { apiSuccess, apiError } from '@/lib/api-response';
import { achievementView } from "@/lib/achievements";
import { requireAuth } from "@/lib/require-auth";

/**
 * 내 업적 (#333).
 *
 * 달성한 것과 **도전 중인 것**을 함께 내려준다. 예전엔 달성한 것만 줘서 무엇을 노릴지 알 길이
 * 없었다. 숨김 업적은 `achievementView` 가 **서버에서** 가린다 — 클라이언트에서 가리면
 * devtools 로 다 보인다.
 *
 * 조회할 때 재평가하므로, 프로필을 여는 것만으로 밀린 업적이 소급 부여된다.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    return apiSuccess(await achievementView(auth.email));
  } catch (error) {
    console.error("Error fetching achievements:", error);
    return apiError("업적을 불러오는 데 실패했습니다.", 500);
  }
}
