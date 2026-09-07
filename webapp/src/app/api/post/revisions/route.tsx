import { NextRequest } from 'next/server';
import { getPostRevisions } from '@/lib/revisions';
import { auth } from '@/auth';
import Post from '@/models/post';
import { connectToDB } from '@/lib/db';
import { canReadPostHistory } from '@/lib/revisions-access';
import { HttpStatusCode } from 'axios';
import { apiSuccess, apiError } from '@/lib/api-response';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const postId = searchParams.get('postId');

    if (!postId) {
        return apiError('postId가 없습니다.', HttpStatusCode.BadRequest);
    }

    try {
        // #168 - a private or deleted post's history is the author's alone. Without this check, the title, author and time
        // went out to anyone logged out, and the id obtained there fetched the body as well.
        await connectToDB();
        const post = await Post.findById(postId)
            .select('isPrivate isDeleted userEmail')
            .lean<{ isPrivate?: boolean; isDeleted?: boolean; userEmail?: string } | null>();
        const session = await auth();
        if (!canReadPostHistory(post, session?.user?.email ?? null)) {
            // Existence is not revealed either - the same principle as the attachment routes.
            return apiError("게시글을 찾을 수 없습니다.", HttpStatusCode.NotFound);
        }

        const allRevisions = await getPostRevisions(postId);

        if (allRevisions === null) {
            return apiError("게시글을 찾을 수 없습니다.", HttpStatusCode.NotFound);
        }

        return apiSuccess(allRevisions);
    } catch (error) {
        console.error("리비전 조회 API 오류:", error);
        return apiError("리비전 조회에 실패했습니다.", HttpStatusCode.InternalServerError);
    }
}