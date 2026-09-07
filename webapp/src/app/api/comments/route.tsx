import { NextRequest, NextResponse } from 'next/server';
import { auth } from "@/auth";
import { apiSuccess, apiError } from '@/lib/api-response';
import Comment from '@/models/comment';
import Post from '@/models/post';
import { connectToDB } from '@/lib/db';
import User from '@/models/user';
import mongoose from 'mongoose';
import { evaluateAndGrant, type GrantedAchievement } from '@/lib/achievements';
import { env } from '@/lib/env';
import { requireAuth } from '@/lib/require-auth';
import { rateLimit, clientIp } from '@/lib/rate-limit';

const POINTS_FOR_NEW_COMMENT = env.points.newComment;

// Converts an anonymous ID from base62 to base5
function __anonidObfuscated(anonid: string): string {
    const charset = ['i', 'l', 'I', '|', '!']; // base-5
  // the base character sets
  const baseChars = '_0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // Step 1: the base string -> one large number
  let num = BigInt(0);
  for (const char of anonid) {
    const value = baseChars.indexOf(char);
    if (value === -1) throw new Error(`Invalid nanoid char: ${char}`);
    num = num * BigInt(62) + BigInt(value);
  }

  // Step 2: encode that number in base 5
  let result = '';
  const base = BigInt(charset.length); // = 5
  while (num > 0) {
    const rem = num % base;
    result = charset[Number(rem)] + result;
    num = num / base;
  }

  return result || charset[0]; // when num === 0
}

export async function POST(req: NextRequest) {
    // Blunting spam and DoS - 10 per minute per IP (unauthenticated anonymous comments are the main risk).
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
        // Anonymous - anonid is required and validated (a 400 rather than a 500 when absent).
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

        let unlockedAchievements: GrantedAchievement[] = [];
        let pointsGained = 0;

        if (userEmail) {
            // Grant points for new comment
            await User.findOneAndUpdate({ email: userEmail }, { $inc: { points: POINTS_FOR_NEW_COMMENT } });
            pointsGained = POINTS_FOR_NEW_COMMENT;
            console.log(`+${pointsGained} point granted for new comment.`);
            
            unlockedAchievements = await evaluateAndGrant(userEmail);
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

    // Unauthenticated reads are allowed (public). The session is used only to decide ownership (isOwn), and the email (PII) is stripped from the response.
    const session = await auth();
    const myEmail = session?.user?.email ?? null;

    // A private post's comments are shown only to its author (stopping them leaking through comments while the body is hidden).
    const owner = await Post.findById(postId).select('isPrivate userEmail').lean<{ isPrivate?: boolean; userEmail?: string } | null>();
    if (owner?.isPrivate && owner.userEmail !== myEmail) {
      return apiSuccess([]);
    }

    const commentsFromDB = await Comment.find ({
        post: new mongoose.Types.ObjectId(postId),
    }) // The isDeleted filter is removed so deleted comments are fetched too.
        .populate({
            path: 'authorId',
            select: 'email name' // The email is for the server's ownership check - only the name is kept in the response
        })
        .populate({
            path: 'parent',
            select: 'author' // Only the parent comment's author name is fetched
        })
        .sort({ createdAt: 1 })
        .lean();

    // The email (PII) is stripped and ownership (isOwn) attached. A deleted comment's content and author are masked.
    const comments = commentsFromDB.map(comment => {
        const a = comment.authorId as { email?: string; name?: string } | null | undefined;
        const isOwn = !!myEmail && !!a && typeof a === 'object' && a.email === myEmail;
        const authorId = a && typeof a === 'object' ? { name: a.name } : a; // blocks exposing the email
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