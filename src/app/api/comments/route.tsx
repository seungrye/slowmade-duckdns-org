import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/authOptions";
import Comment from '@/models/comment';
import { connectToDB } from '@/lib/db';
import mongoose, { HydratedDocument } from 'mongoose';
import User from '@/models/user';
import { checkAndGrantCommentCountAchievements } from '@/lib/achievements';
import { AchievementType } from '@/models/achievement';

// 익명 ID를 base62에서 base5로 변환하는 함수
function __anonidObfuscated(anonid: string): string {
    const charset = ['i', 'l', 'I', '|', '!']; // base-5
  // base 문자셋 정의
  const baseChars = '_0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // Step 1: base 문자열 → 하나의 큰 숫자로 변환
  let num = BigInt(0);
  for (const char of anonid) {
    const value = baseChars.indexOf(char);
    if (value === -1) throw new Error(`Invalid nanoid char: ${char}`);
    num = num * BigInt(62) + BigInt(value);
  }

  // Step 2: 그 숫자를 base-5로 인코딩
  let result = '';
  const base = BigInt(charset.length); // = 5
  while (num > 0) {
    const rem = num % base;
    result = charset[Number(rem)] + result;
    num = num / base;
  }

  return result || charset[0]; // num === 0 일 때
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const { postId, parentId = null, content, anonid } = await req.json();

    if (!content) {
        return NextResponse.json({ message: "댓글 내용이 없습니다." }, { status: 400 });
    }

    await connectToDB();

    let author;
    let authorId = null;
    let userEmail = null;

    if (session && session.user) {
        author = session.user.name || "accounted user";
        userEmail = session.user.email;
        const user = await User.findOne({ email: userEmail });
        if (user) authorId = user._id;
    } else {
        author = __anonidObfuscated(anonid);
    }

    try {
        const newComment = new Comment({
            post: postId,
            parent: parentId,
            content,
            author,
            authorId,
        });

        await newComment.save();

        let unlockedAchievements: HydratedDocument<AchievementType>[] = [];
        if (userEmail) {
            unlockedAchievements = await checkAndGrantCommentCountAchievements(userEmail);
        }

        return NextResponse.json({ newComment, unlockedAchievements }, { status: 201 });
    } catch (error) {
        console.error("Error creating comment:", error);
        return NextResponse.json({ message: "댓글 작성에 실패했습니다." }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const postId = req.nextUrl.searchParams.get("postId") || "";
    if (!postId) {
      return NextResponse.json({ error: "Missing postId" }, { status: 400 });
    }

    await connectToDB();

    const comments = await Comment.find ({ post: new mongoose.Types.ObjectId(postId) })
        .sort({ createdAt: 1 })
        .lean();

    return NextResponse.json(comments);
}