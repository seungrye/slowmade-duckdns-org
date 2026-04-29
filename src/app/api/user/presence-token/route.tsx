import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { connectToDB } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api-response';
import User from '@/models/user';
import { randomBytes } from 'crypto';

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return apiError('Unauthorized', 401);

  await connectToDB();

  const user = await User.findOne({ email: session.user.email }).select('presenceToken').lean();
  if (!user) return apiError('User not found', 404);

  const token = (user as { presenceToken?: string | null }).presenceToken ?? null;
  return apiSuccess({ token });
}

export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return apiError('Unauthorized', 401);

  await connectToDB();

  const token = randomBytes(32).toString('hex');
  await User.findOneAndUpdate(
    { email: session.user.email },
    { presenceToken: token }
  );

  return apiSuccess({ token });
}
