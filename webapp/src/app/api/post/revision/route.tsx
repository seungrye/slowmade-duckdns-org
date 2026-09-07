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

        // #168 - the original post's visibility is checked before the body is served. Without this check, a private post's
        // full jsonContent went straight out to anyone logged out.
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
