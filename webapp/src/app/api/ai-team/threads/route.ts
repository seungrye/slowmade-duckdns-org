// AI 팀 요청 스레드 목록 (#207).
//
// 야간 러너가 "오늘 처리할 요청이 있나"를 묻는 자리. 목록에는 **본문을 싣지 않는다** —
// 어느 스레드를 볼지 고르는 데 필요 없고, 필요 없는 내용은 안 내보내는 편이 낫다.
import { NextRequest, NextResponse } from 'next/server';
import { apiSuccess } from '@/lib/api-response';
import { connectToDB } from '@/lib/db';
import Post from '@/models/post';
import { requireAiTeam } from '@/lib/ai-team/guard';
import { aiTeamPostFilter } from '@/lib/ai-team/thread-match';

/** 한 번에 이만큼만. 요청이 쌓여도 러너가 한 번에 다 읽을 이유는 없다. */
const MAX_THREADS = 50;

interface ThreadRow {
  _id: unknown;
  title?: string;
  tags?: string[];
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export async function GET(req: NextRequest) {
  const gate = requireAiTeam(req);
  if (gate instanceof NextResponse) return gate;

  await connectToDB();

  const posts = await Post.find(aiTeamPostFilter(gate.ownerEmail))
    .select('_id title tags createdAt updatedAt')
    .sort({ updatedAt: -1 })
    .limit(MAX_THREADS)
    .lean<ThreadRow[]>();

  return apiSuccess(
    (posts ?? []).map((p) => ({
      postId: String(p._id),
      title: p.title ?? '',
      tags: p.tags ?? [],
      createdAt: p.createdAt ?? null,
      updatedAt: p.updatedAt ?? null,
    })),
  );
}
