import { NextResponse } from 'next/server';
import { auth } from "@/auth";
import { connectToDB } from '@/lib/db';
import User, { UserType } from '@/models/user';

export async function GET() {
  const session = await auth();

  if (!session || !session.user?.email) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDB();
    const user: UserType | null = await User.findOne({ email: session.user.email }, 'settings');

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
  const session = await auth();

  if (!session || !session.user?.email) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { theme } = await request.json();

    if (!['light', 'dark', 'system'].includes(theme)) {
        return NextResponse.json({ message: 'Invalid theme value' }, { status: 400 });
    }

    await connectToDB();
    const updatedUser = await User.findOneAndUpdate(
      { email: session.user.email },
      { $set: { 'settings.theme': theme } },
      { new: true, upsert: true, projection: { settings: 1 } }
    );

    return NextResponse.json(updatedUser?.settings);
  } catch (error) {
    console.error('Error updating user settings:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}