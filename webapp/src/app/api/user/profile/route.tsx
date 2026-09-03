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
    const user = await User.findOne({ email: auth.email }).select('name email profileImage points createdAt birthday birthTime');

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

  let body: { birthday?: unknown; birthTime?: unknown };
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

  // 태어난 시(선택) — "HH:mm" 또는 비움. 사주 시주 계산용. (#390)
  const rawTime = body.birthTime;
  const clearingTime = rawTime === null || rawTime === '' || rawTime === undefined;
  let birthTime: string | null = null;
  if (!clearingTime) {
    if (typeof rawTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime)) {
      return apiError("태어난 시는 'HH:mm' 형식이어야 합니다.", 400);
    }
    birthTime = rawTime;
  }

  try {
    await connectToDB();
    // 생일이 지워지면 태어난 시도 함께 지운다(사주 근거가 없어지므로).
    const set: Record<string, unknown> = {};
    const unset: Record<string, unknown> = {};
    if (birthday) set.birthday = birthday; else unset.birthday = 1;
    if (birthday && birthTime) set.birthTime = birthTime; else unset.birthTime = 1;
    const update: Record<string, unknown> = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;
    const updated = await User.findOneAndUpdate(
      { email: auth.email }, update,
      { new: true, projection: { birthday: 1, birthTime: 1 } }
    );

    if (!updated) {
      return apiError("사용자를 찾을 수 없습니다.", 404);
    }

    return apiSuccess({ birthday: updated.birthday ?? null, birthTime: updated.birthTime ?? null });
  } catch (error) {
    console.error("Error updating birthday:", error);
    return apiError("생일을 저장하는 데 실패했습니다.", 500);
  }
}
