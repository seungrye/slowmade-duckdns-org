import { connectToDB } from '@/lib/db';
import PostRevision from '@/models/post-revision';
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import Post from "@/models/post";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const postId = searchParams.get('postId');

    if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
        return NextResponse.json({ message: '유효하지 않거나 postId가 없습니다.' }, { status: 400 });
    }

    await connectToDB();

    try {
        const select = 'version author createdAt title'; // 필요한 필드만 선택
        const revisions = await PostRevision.find({ postId })
            .sort({ version: -1 }) // 최신 버전이 위로 오도록 정렬
            .select(select) // 목록에 필요한 필드만 선택
            .lean();

        const lastRevision = await Post.findById(postId)
            .select(select)
            .lean();

        return NextResponse.json([lastRevision, ...revisions]);
    } catch (error) {
        console.error("리비전 조회 오류:", error);
        return NextResponse.json({ message: "리비전 조회에 실패했습니다." }, { status: 500 });
    }
}