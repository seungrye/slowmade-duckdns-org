import { NextResponse } from 'next/server';
import { apiSuccess, apiError } from '@/lib/api-response';
import { connectToDB } from '@/lib/db';
import User, { UserType } from '@/models/user';
import { requireAuth } from '@/lib/require-auth';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    await connectToDB();
    const user: UserType | null = await User.findOne({ email: auth.email }, 'settings');

    if (!user) {
      return apiError('User not found', 404);
    }

    return apiSuccess(user.settings || { theme: 'system' });
  } catch (error) {
    console.error('Error fetching user settings:', error);
    return apiError('Internal Server Error', 500);
  }
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { theme } = await request.json();

    if (!['light', 'dark', 'system'].includes(theme)) {
      return apiError('Invalid theme value', 400);
    }

    await connectToDB();
    const updatedUser = await User.findOneAndUpdate(
      { email: auth.email },
      { $set: { 'settings.theme': theme } },
      { new: true, upsert: true, projection: { settings: 1 } }
    );

    // 테마는 client(localStorage)에서 관리하므로 쿠키를 더 이상 세팅하지 않는다.
    // DB(user.settings.theme)는 원본으로 유지되고 ThemeSync 가 로그인 시 동기화한다.
    return apiSuccess(updatedUser?.settings);
  } catch (error) {
    console.error('Error updating user settings:', error);
    return apiError('Internal Server Error', 500);
  }
}
