import { NextResponse } from "next/server";
import { apiSuccess, apiError } from '@/lib/api-response';
import { connectToDB } from "@/lib/db";
import User from "@/models/user";
import { requireAuth } from "@/lib/require-auth";
import { parseBirthdayInput } from "@/lib/birthday";

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    await connectToDB();
    const user = await User.findOne({ email: auth.email }).select('name email profileImage points createdAt birthday');

    if (!user) {
      return apiError("사용자를 찾을 수 없습니다.", 404);
    }

    return apiSuccess(user);
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return apiError("프로필 정보를 불러오는 데 실패했습니다.", 500);
  }
}

/**
 * 생일 등록·수정·삭제 (#326).
 *
 * 빈 값(`null`·`''`)은 오류가 아니라 **삭제**다 — 한 번 넣은 생일을 지울 길이 없으면
 * 폭죽을 끌 방법이 없어진다. 그 외 형식·범위 오류는 400 으로 돌려보내고 저장하지 않는다.
 */
export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  let body: { birthday?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError("요청 본문을 읽을 수 없습니다.", 400);
  }

  const raw = body.birthday;
  const clearing = raw === null || raw === '';
  if (!clearing && typeof raw !== 'string') {
    return apiError("생일은 'YYYY-MM-DD' 형식이어야 합니다.", 400);
  }

  const birthday = clearing ? null : parseBirthdayInput(raw as string);
  if (!clearing && !birthday) {
    return apiError("생일이 올바르지 않습니다. 1900년 이후의 지난 날짜여야 합니다.", 400);
  }

  try {
    await connectToDB();
    const updated = await User.findOneAndUpdate(
      { email: auth.email },
      birthday ? { $set: { birthday } } : { $unset: { birthday: 1 } },
      { new: true, projection: { birthday: 1 } }
    );

    if (!updated) {
      return apiError("사용자를 찾을 수 없습니다.", 404);
    }

    return apiSuccess({ birthday: updated.birthday ?? null });
  } catch (error) {
    console.error("Error updating birthday:", error);
    return apiError("생일을 저장하는 데 실패했습니다.", 500);
  }
}
