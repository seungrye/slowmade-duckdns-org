import { NextResponse } from 'next/server';
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
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user.settings || { theme: 'system' });
  } catch (error) {
    console.error('Error fetching user settings:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { theme } = await request.json();

    if (!['light', 'dark', 'system'].includes(theme)) {
      return NextResponse.json({ message: 'Invalid theme value' }, { status: 400 });
    }

    await connectToDB();
    const updatedUser = await User.findOneAndUpdate(
      { email: auth.email },
      { $set: { 'settings.theme': theme } },
      { new: true, upsert: true, projection: { settings: 1 } }
    );

    return NextResponse.json(updatedUser?.settings);
  } catch (error) {
    console.error('Error updating user settings:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
