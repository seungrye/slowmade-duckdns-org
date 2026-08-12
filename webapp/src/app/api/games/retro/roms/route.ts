// 내 롬 목록 (#109).
//
// 올리기는 `../rom-upload` 에 따로 있다 — middleware 의 10MB 본문 제한을 피하려면 그 경로만
// matcher 에서 빼야 하는데, 여기까지 접두사로 빼면 `[id]/file` 응답의 보안 헤더가 사라진다.

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

  return apiSuccess(docs.map(toRomDto));
}
