import { NextRequest, NextResponse } from 'next/server';
import Comment from '@/models/comment';
import { connectToDB } from '@/lib/db';
import mongoose from 'mongoose';

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
    const { postId, parentId = null, content, anonid } = await req.json();
    const author = __anonidObfuscated(anonid);

    await connectToDB();

    const newComment = await Comment.create({
        post: postId,
        author: author,
        authorId: null,
        parent: parentId,
        content,
    });

    return NextResponse.json(newComment, { status: 201 });
}

export async function GET(
    req: NextRequest
) {
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