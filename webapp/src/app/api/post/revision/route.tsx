import { NextRequest } from 'next/server';
import { getRevision } from '@/lib/revisions';
import { auth } from '@/auth';
import Post from '@/models/post';
import { connectToDB } from '@/lib/db';
import { canReadPostHistory } from '@/lib/revisions-access';
import { apiSuccess, apiError } from '@/lib/api-response';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const revisionId = searchParams.get('revisionId');

    if (!revisionId) {
        return apiError('revisionId가 없습니다.', 400);
    }

    try {
        const revision = await getRevision(revisionId);

        if (!revision) {
            return apiError('리비전을 찾을 수 없습니다.', 404);
        }

        // #168 — 본문을 내주기 전에 원본 글의 공개 여부를 본다. 이 검사가 없어 비공개 글의
        // jsonContent 전문이 비로그인에게 그대로 나갔다.
        await connectToDB();
        const post = await Post.findById(revision.postId)
            .select('isPrivate isDeleted userEmail')
            .lean<{ isPrivate?: boolean; isDeleted?: boolean; userEmail?: string } | null>();
        const session = await auth();
        if (!canReadPostHistory(post, session?.user?.email ?? null)) {
            return apiError('리비전을 찾을 수 없습니다.', 404);
        }

        return apiSuccess({ jsonContent: revision.jsonContent });
    } catch (error) {
        console.error('리비전 단건 조회 오류:', error);
        return apiError('리비전 조회에 실패했습니다.', 500);
    }
}
