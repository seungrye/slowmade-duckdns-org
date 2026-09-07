import { connectToDB } from '@/lib/db';
import PostRevision from '@/models/post-revision';
import Post from "@/models/post";
import mongoose from 'mongoose';

/** The type of each revision entry shown on the history page */
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
    // #168 - postId is returned alongside. Without it the route cannot tell **whose post the revision belongs to** and
    // cannot judge permission (which is how private post bodies leaked outright).
    const revision = await PostRevision.findById(revisionId)
        .select('jsonContent postId')
        .lean() as { jsonContent: unknown; postId: unknown } | null;
    if (!revision) return null;
    return { jsonContent: revision.jsonContent, postId: String(revision.postId) };
}
