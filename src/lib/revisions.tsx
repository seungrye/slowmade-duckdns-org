import { connectToDB } from '@/lib/db';
import PostRevision from '@/models/post-revision';
import Post from "@/models/post";
import mongoose from 'mongoose';

/** 히스토리 페이지에 표시될 각 리비전 항목의 타입 */
export interface RevisionListItem {
    _id: string; // Mongoose ObjectId 또는 문자열
    version: number;
    title: string;
    author?: string;
    createdAt: Date;
}

/**
 * 특정 게시글의 모든 수정 이력(현재 버전 포함)을 가져옵니다.
 * @param postId 게시글의 ID
 * @returns 수정 이력 배열을 반환합니다. 게시글이 없으면 null을 반환합니다.
 */
export async function getPostRevisions(postId: string): Promise<RevisionListItem[] | null> {
    if (!mongoose.Types.ObjectId.isValid(postId)) {
        return null; // 유효하지 않은 ID는 '찾을 수 없음'으로 처리
    }

    await connectToDB();

    // 과거 리비전과 현재 게시글을 병렬로 조회하여 성능을 높입니다.
    const [pastRevisions, currentPost] = await Promise.all([
        PostRevision.find({ postId }).sort({ version: -1 }).select('_id version author createdAt title').lean(),
        Post.findById(postId).select('_id version author title updatedAt').lean()
    ]);

    // 원본 게시글이 없으면 null을 반환합니다.
    if (!currentPost) {
        return null;
    }

    const allRevisions: RevisionListItem[] = pastRevisions.map(revision => ({
        _id: String(revision._id), // ObjectId를 문자열로 변환
        version: revision.version,
        title: revision.title,
        author: revision.author,
        createdAt: revision.createdAt,
    }));

    // 현재 버전 정보를 리비전 목록 형식에 맞게 변환합니다.
    const currentVersion: RevisionListItem = {
        _id: currentPost._id.toString(), // ObjectId를 문자열로 변환
        version: currentPost.version,
        title: currentPost.title,
        author: currentPost.author,
        createdAt: currentPost.updatedAt, // 현재 버전은 마지막 수정일을 기준으로 합니다.
    };

    allRevisions.unshift(currentVersion);

    return allRevisions;
}