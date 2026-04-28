import { NextRequest } from 'next/server';
import { getRevision } from '@/lib/revisions';
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

        return apiSuccess(revision);
    } catch (error) {
        console.error('리비전 단건 조회 오류:', error);
        return apiError('리비전 조회에 실패했습니다.', 500);
    }
}
