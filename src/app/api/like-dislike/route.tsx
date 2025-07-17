import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import Post from "@/models/post";
import { HttpStatusCode } from "axios";
import { checkAndGrantPostInteractionAchievements } from "@/lib/achievements";

export async function POST(req: Request) {
  await connectToDB();
  const payload = await req.json();

  if (!payload?._id) {
    return NextResponse.json({ message: "정상적인 _id 값이 아닙니다." }, { status: HttpStatusCode.BadRequest });
  }

  if (typeof payload.likeChecked !== 'boolean') {
    return NextResponse.json({ message: "likeChecked는 boolean이어야 합니다." }, { status: HttpStatusCode.BadRequest });
  }

  try {
    const likesDiff = (payload.likeChecked ? 1 : -1);
    const updatedPost = await Post.findByIdAndUpdate(
      payload._id,
      [
        {
          $set: {
            likes: {
              $cond: [
                { $lte: [{ $add: ['$likes', likesDiff] }, 0] },
                0,
                { $add: ['$likes', likesDiff] }
              ]
            },
          }
        }
      ],
      { new: true } // ✅ 업데이트된 값을 반환
    );

    await checkAndGrantPostInteractionAchievements(payload._id);

    return NextResponse.json({ message: "Like/Dislike 업데이트 성공", likes: updatedPost.likes }, { status: HttpStatusCode.Ok });
  } catch (error) {
    return NextResponse.json({ message: "게시글 저장 실패", error }, { status: HttpStatusCode.InternalServerError });
  }
}
