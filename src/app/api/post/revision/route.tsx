import { NextRequest, NextResponse } from 'next/server';
import { getRevision } from '@/lib/revisions';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const revisionId = searchParams.get('revisionId');

    if (!revisionId) {
        return NextResponse.json({ message: 'revisionId가 없습니다.' }, { status: 400 });
    }

    try {
        const revision = await getRevision(revisionId);

        if (!revision) {
            return NextResponse.json({ message: '리비전을 찾을 수 없습니다.' }, { status: 404 });
        }

        return NextResponse.json(revision);
    } catch (error) {
        console.error('리비전 단건 조회 오류:', error);
        return NextResponse.json({ message: '리비전 조회에 실패했습니다.' }, { status: 500 });
    }
}
