import { NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/db';
import PostRevision from '@/models/post-revision';
import mongoose from 'mongoose';
import { HttpStatusCode } from 'axios';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const revisionId = searchParams.get('revisionId');

    if (!revisionId) {
        return NextResponse.json({ message: 'revisionId가 없습니다.' }, { status: HttpStatusCode.BadRequest });
    }

    if (!mongoose.Types.ObjectId.isValid(revisionId)) {
        return NextResponse.json({ message: '유효하지 않은 revisionId입니다.' }, { status: HttpStatusCode.BadRequest });
    }

    try {
        await connectToDB();
        const revision = await PostRevision.findById(revisionId).lean();

        if (!revision) {
            return NextResponse.json({ message: '리비전을 찾을 수 없습니다.' }, { status: HttpStatusCode.NotFound });
        }

        return NextResponse.json(revision);
    } catch (error) {
        console.error("리비전 조회 오류:", error);
        return NextResponse.json({ message: "리비전 조회에 실패했습니다." }, { status: HttpStatusCode.InternalServerError });
    }
}
