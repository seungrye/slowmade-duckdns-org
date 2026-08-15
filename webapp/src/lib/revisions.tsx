import { connectToDB } from '@/lib/db';
import PostRevision from '@/models/post-revision';
import Post from "@/models/post";
import mongoose from 'mongoose';

/** 히스토리 페이지에 표시될 각 리비전 항목의 타입 */
export interface RevisionListItem {
    _id: string;
    version: number;
    title: string;
    author?: string;
    createdAt: Date;
    isCurrent: boolean;
}

export async function getPostRevisions(postId: string): Promise<RevisionListItem[] | null> {
    if (!mongoose.Types.ObjectId.isValid(postId)) {
        return null;
    }

    await connectToDB();

    const [pastRevisions, currentPost] = await Promise.all([
        PostRevision.find({ postId }).sort({ version: -1 }).select('_id version author createdAt title').lean(),
        Post.findById(postId).select('_id version author title updatedAt').lean()
    ]);

    if (!currentPost) {
        return null;
    }

    const allRevisions: RevisionListItem[] = pastRevisions.map(revision => ({
        _id: String(revision._id),
        version: revision.version,
        title: revision.title,
        author: revision.author,
        createdAt: revision.createdAt,
        isCurrent: false,
    }));

    const currentVersion: RevisionListItem = {
        _id: currentPost._id.toString(),
        version: currentPost.version,
        title: currentPost.title,
        author: currentPost.author,
        createdAt: currentPost.updatedAt,
        isCurrent: true,
    };

    allRevisions.unshift(currentVersion);

    return allRevisions;
}

export async function getRevision(
    revisionId: string,
): Promise<{ jsonContent: unknown; postId: string } | null> {
    if (!mongoose.Types.ObjectId.isValid(revisionId)) return null;
    await connectToDB();
    // #168 — postId 를 함께 돌려준다. 이게 없으면 라우트가 "이 리비전이 누구 글의 것인지" 를
    // 알 수 없어 권한을 판정하지 못한다(그래서 비공개 글 본문이 그대로 샜다).
    const revision = await PostRevision.findById(revisionId)
        .select('jsonContent postId')
        .lean() as { jsonContent: unknown; postId: unknown } | null;
    if (!revision) return null;
    return { jsonContent: revision.jsonContent, postId: String(revision.postId) };
}
