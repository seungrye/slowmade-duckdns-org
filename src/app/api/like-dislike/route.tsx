import { NextResponse } from "next/server";
import { apiSuccess, apiError } from '@/lib/api-response';
import { connectToDB } from "@/lib/db";
import Post from "@/models/post";
import { HttpStatusCode } from "axios";
import { checkAndGrantPostInteractionAchievements } from "@/lib/achievements";

export async function POST(req: Request) {
  await connectToDB();
  const payload = await req.json();

  if (!payload?._id) {
    return apiError("정상적인 _id 값이 아닙니다.", HttpStatusCode.BadRequest);
  }

  if (typeof payload.likeChecked !== 'boolean') {
    return apiError("likeChecked는 boolean이어야 합니다.", HttpStatusCode.BadRequest);
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
      { new: true }
    );

    if (!updatedPost) {
      return apiError("게시글을 찾을 수 없습니다.", HttpStatusCode.NotFound);
    }

    await checkAndGrantPostInteractionAchievements(payload._id);

    return apiSuccess({ likes: updatedPost.likes }, HttpStatusCode.Ok, "Like/Dislike 업데이트 성공");
  } catch (error) {
    return apiError("게시글 저장 실패", HttpStatusCode.InternalServerError);
  }
}
