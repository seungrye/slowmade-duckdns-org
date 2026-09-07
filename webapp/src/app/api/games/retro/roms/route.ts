// My ROM list (#109).
//
// Uploading lives separately at `../rom-upload` - dodging middleware's 10MB body limit means excluding that path
// from the matcher, and excluding this far by prefix would strip the security headers from `[id]/file`'s response.

import { NextResponse } from 'next/server';
import { apiSuccess } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';
import { connectToDB } from '@/lib/db';
import RetroRom from '@/models/retro-rom';
import { toRomDto, type LeanRom } from '@/lib/retro/rom-dto';

export async function GET() {
  const authed = await requireAuth();
  if (authed instanceof NextResponse) return authed;

  await connectToDB();
  const docs = (await RetroRom.find({ userEmail: authed.email, isDeleted: { $ne: true } })
    .sort({ createdAt: -1 })
    .lean()) as unknown as LeanRom[];

  return apiSuccess(docs.map((d) => toRomDto(d)));
}
