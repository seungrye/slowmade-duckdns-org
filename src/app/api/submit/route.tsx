import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import Post from "@/models/post";

export async function POST(req: Request) {
  await connectToDB();
  const payload = await req.json();

  if (!payload?.title || !payload?.content || !payload?.userEmail) {
    return NextResponse.json({ message: "모든 필드를 입력해주세요." }, { status: 400 });
  }

  try {
    const newPost = new Post(payload);
    await newPost.save();

    return NextResponse.json({ message: "게시글 저장 완료" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: "게시글 저장 실패", error }, { status: 500 });
  }
}
