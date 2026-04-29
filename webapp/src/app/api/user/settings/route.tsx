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

    const response = apiSuccess(updatedUser?.settings);
    response.headers.set(
      'Set-Cookie',
      `theme=${theme}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`
    );
    return response;
  } catch (error) {
    console.error('Error updating user settings:', error);
    return apiError('Internal Server Error', 500);
  }
}
