import { NextRequest, NextResponse } from 'next/server';
import { getPostRevisions } from '@/lib/revisions';
import { HttpStatusCode } from 'axios';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const postId = searchParams.get('postId');

    if (!postId) {
        return NextResponse.json({ message: 'postId가 없습니다.' }, { status: HttpStatusCode.BadRequest });
    }

    try {
        const allRevisions = await getPostRevisions(postId);

        if (allRevisions === null) {
            return NextResponse.json({ message: "게시글을 찾을 수 없습니다." }, { status: HttpStatusCode.NotFound });
        }

        return NextResponse.json(allRevisions);
    } catch (error) {
        console.error("리비전 조회 API 오류:", error);
        return NextResponse.json({ message: "리비전 조회에 실패했습니다." }, { status: HttpStatusCode.InternalServerError });
    }
}