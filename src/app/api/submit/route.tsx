import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import Post from "@/models/post";

export async function POST(req: Request) {
  await connectToDB();
  const { title, content, author, userEmail } = await req.json();

  if (!title || !content || !userEmail) {
    return NextResponse.json({ message: "모든 필드를 입력해주세요." }, { status: 400 });
  }

  try {
    const newPost = new Post({
      title,
      content,
      author,
      userEmail
    });
    await newPost.save();

    return NextResponse.json({ message: "게시글 저장 완료" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: "게시글 저장 실패", error }, { status: 500 });
  }
}
