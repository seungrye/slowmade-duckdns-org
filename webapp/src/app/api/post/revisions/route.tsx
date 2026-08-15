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
        // #168 — 비공개·삭제된 글의 이력은 작성자만 본다. 이 검사가 없어 비로그인에게 제목·
        // 작성자·시각이 그대로 나갔고, 거기서 얻은 id 로 본문까지 받아 갈 수 있었다.
        await connectToDB();
        const post = await Post.findById(postId)
            .select('isPrivate isDeleted userEmail')
            .lean<{ isPrivate?: boolean; isDeleted?: boolean; userEmail?: string } | null>();
        const session = await auth();
        if (!canReadPostHistory(post, session?.user?.email ?? null)) {
            // 존재 여부도 알려 주지 않는다 — 첨부 라우트와 같은 원칙.
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