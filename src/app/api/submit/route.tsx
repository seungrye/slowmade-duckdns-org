import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import Post from "@/models/post";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    return NextResponse.json({ message: "로그인 후 이용해주세요." }, { status: 401 });
  }

  await connectToDB();
  const payload = await req.json();

  if (session.user?.email != payload?.userEmail) {
    console.error("사용자 이메일이 일치하지 않습니다.", {
      sessionEmail: session.user.email,
      payloadEmail: payload?.userEmail,
    });
    return NextResponse.json({ message: "사용자 정보가 일치하지 않습니다." }, { status: 403 });
  }

  if (!payload?.title || !payload?.jsonContent) {
    return NextResponse.json({ message: "모든 필드를 입력해주세요." }, { status: 400 });
  }

  try {
    if (payload._id) {
      await Post.findByIdAndUpdate(payload._id, payload);
    } else {
      const newPost = new Post(payload);
      await newPost.save();
    }

    return NextResponse.json({ message: "게시글 저장 완료" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: "게시글 저장 실패", error }, { status: 500 });
  }
}
