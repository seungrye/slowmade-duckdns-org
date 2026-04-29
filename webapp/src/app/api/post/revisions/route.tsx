import { NextRequest } from 'next/server';
import { getPostRevisions } from '@/lib/revisions';
import { HttpStatusCode } from 'axios';
import { apiSuccess, apiError } from '@/lib/api-response';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const postId = searchParams.get('postId');

    if (!postId) {
        return apiError('postId가 없습니다.', HttpStatusCode.BadRequest);
    }

    try {
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