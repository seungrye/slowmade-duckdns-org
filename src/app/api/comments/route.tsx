import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/authOptions";
import Comment from '@/models/comment';
import { connectToDB } from '@/lib/db';
import mongoose, { HydratedDocument } from 'mongoose';
import User from '@/models/user';
import { checkAndGrantCommentCountAchievements } from '@/lib/achievements';
import { AchievementType } from '@/models/achievement';

const POINTS_FOR_NEW_COMMENT = parseInt(process.env.POINTS_FOR_NEW_COMMENT || '1', 10);

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
        let pointsGained = 0;

        if (userEmail) {
            // Grant points for new comment
            await User.findOneAndUpdate({ email: userEmail }, { $inc: { points: POINTS_FOR_NEW_COMMENT } });
            pointsGained = POINTS_FOR_NEW_COMMENT;
            console.log(`+${pointsGained} point granted to ${userEmail} for new comment.`);
            
            unlockedAchievements = await checkAndGrantCommentCountAchievements(userEmail);
        }

        return NextResponse.json({ newComment, unlockedAchievements, pointsGained }, { status: 201 });
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

    const commentsFromDB = await Comment.find ({
        post: new mongoose.Types.ObjectId(postId),
    }) // isDeleted 필터를 제거하여 삭제된 댓글도 함께 조회합니다.
        .populate({
            path: 'authorId',
            select: 'email name' // 필요한 필드만 선택적으로 가져옴
        })
        .sort({ createdAt: 1 })
        .lean();

    // 삭제된 댓글의 내용을 서버에서 변경하여 반환합니다.
    const comments = commentsFromDB.map(comment => {
        if (comment.isDeleted) {
            return {
                ...comment,
                content: '삭제된 댓글입니다.',
                author: '알 수 없음',
            };
        }
        return comment;
    });

    return NextResponse.json(comments);
}

export async function DELETE(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
    }

    const { commentId } = await req.json();
    if (!commentId) {
        return NextResponse.json({ message: "댓글 ID가 필요합니다." }, { status: 400 });
    }

    await connectToDB();

    const user = await User.findOne({ email: session.user.email });
    if (!user) {
        return NextResponse.json({ message: "사용자를 찾을 수 없습니다." }, { status: 404 });
    }

    // findOneAndUpdate를 사용하여 한 번의 쿼리로 처리
    const updatedComment = await Comment.findOneAndUpdate(
        { _id: commentId, authorId: user._id }, // 조건: 댓글 ID와 작성자 ID 일치
        { $set: { isDeleted: true } }, // 작업: isDeleted 플래그 설정
        { new: true }
    );

    if (!updatedComment) {
        // updatedComment가 null이면 댓글이 존재하지 않거나 삭제 권한이 없는 경우입니다.
        return NextResponse.json({ message: "댓글을 찾을 수 없거나 삭제 권한이 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ message: "댓글이 삭제되었습니다." }, { status: 200 });
}