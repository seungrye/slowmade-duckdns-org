import { NextRequest, NextResponse } from 'next/server';
import { auth } from "@/auth";
import { apiSuccess, apiError } from '@/lib/api-response';
import Comment from '@/models/comment';
import { connectToDB } from '@/lib/db';
import mongoose, { HydratedDocument } from 'mongoose';
import User from '@/models/user';
import { checkAndGrantCommentCountAchievements } from '@/lib/achievements';
import { AchievementType } from '@/models/achievement';
import { env } from '@/lib/env';
import { requireAuth } from '@/lib/require-auth';
import { rateLimit, clientIp } from '@/lib/rate-limit';

const POINTS_FOR_NEW_COMMENT = env.points.newComment;

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
    // 스팸/DoS 완화 — IP당 분당 10건(무인증 익명 댓글이 주 위험).
    if (!rateLimit(`comment:${clientIp(req)}`, 10, 60_000)) {
        return apiError("요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.", 429);
    }

    const session = await auth();
    const { postId, parentId = null, content, anonid } = await req.json();

    if (typeof content !== "string" || content.trim().length === 0) {
        return apiError("댓글 내용이 없습니다.", 400);
    }
    if (content.length > 5000) {
        return apiError("댓글이 너무 깁니다. (최대 5000자)", 413);
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
        // 익명 — anonid 필수·유효성 검증(미전달 시 500 대신 400).
        if (typeof anonid !== "string" || anonid.length === 0) {
            return apiError("익명 식별자가 필요합니다.", 400);
        }
        try {
            author = __anonidObfuscated(anonid);
        } catch {
            return apiError("익명 식별자가 올바르지 않습니다.", 400);
        }
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
            console.log(`+${pointsGained} point granted for new comment.`);
            
            unlockedAchievements = await checkAndGrantCommentCountAchievements(userEmail);
        }

        return apiSuccess({ newComment, unlockedAchievements, pointsGained }, 201);
    } catch (error) {
        console.error("Error creating comment:", error);
        return apiError("댓글 작성에 실패했습니다.", 500);
    }
}

export async function GET(req: NextRequest) {
    const postId = req.nextUrl.searchParams.get("postId") || "";
    if (!postId) {
      return apiError("Missing postId", 400);
    }

    await connectToDB();

    // 무인증 조회 허용(공개). 세션은 "내 댓글" 소유판정(isOwn)에만 쓰고, 이메일(PII)은 응답에서 제거.
    const session = await auth();
    const myEmail = session?.user?.email ?? null;

    const commentsFromDB = await Comment.find ({
        post: new mongoose.Types.ObjectId(postId),
    }) // isDeleted 필터를 제거하여 삭제된 댓글도 함께 조회합니다.
        .populate({
            path: 'authorId',
            select: 'email name' // email 은 서버 소유판정용 — 응답엔 name 만 남김
        })
        .populate({
            path: 'parent',
            select: 'author' // 부모 댓글의 작성자 이름만 가져옴
        })
        .sort({ createdAt: 1 })
        .lean();

    // 이메일(PII) 제거 + 소유판정(isOwn) 부여. 삭제된 댓글은 내용/작성자 마스킹.
    const comments = commentsFromDB.map(comment => {
        const a = comment.authorId as { email?: string; name?: string } | null | undefined;
        const isOwn = !!myEmail && !!a && typeof a === 'object' && a.email === myEmail;
        const authorId = a && typeof a === 'object' ? { name: a.name } : a; // email 노출 차단
        const base = { ...comment, authorId, isOwn };
        if (comment.isDeleted) {
            return { ...base, content: '삭제된 댓글입니다.', author: '알 수 없음' };
        }
        return base;
    });

    return apiSuccess(comments);
}

export async function DELETE(req: NextRequest) {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { commentId } = await req.json();
    if (!commentId) {
        return apiError("댓글 ID가 필요합니다.", 400);
    }

    await connectToDB();

    const user = await User.findOne({ email: auth.email });
    if (!user) {
        return apiError("사용자를 찾을 수 없습니다.", 404);
    }

    const updatedComment = await Comment.findOneAndUpdate(
        { _id: commentId, authorId: user._id },
        { $set: { isDeleted: true } },
        { new: true }
    );

    if (!updatedComment) {
        return apiError("댓글을 찾을 수 없거나 삭제 권한이 없습니다.", 404);
    }

    return apiSuccess(null, 200, "댓글이 삭제되었습니다.");
}