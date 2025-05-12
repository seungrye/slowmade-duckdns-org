import { connectToDB } from "@/lib/db";
import Post from "@/models/post";
import { SortOption } from "./sort";
import { PipelineStage } from "mongoose";

async function fetchLatestPosts(withComments: boolean) {
  const pipeline: PipelineStage[] = [
    {
      $sort: {
        createdAt: -1,
      },
    },
    {
      $limit: 12,
    },
    {
      $lookup: {
        from: "comments", // 실제 MongoDB 컬렉션 이름은 소문자+복수형이 기본
        localField: "_id",
        foreignField: "post",
        as: "comments",
      },
    },
  ];

  if (!withComments) {
    pipeline.push(
      {
        $project: {
          comments: 0,
        },
      });
  }

  return await Post.aggregate(pipeline);
}

async function fetchPopularPosts(withComments: boolean) {
  const pipeline: PipelineStage[] = [
    {
      $sort: {
        views: -1,
      },
    },
    {
      $limit: 12,
    },
    {
      $lookup: {
        from: "comments", // 실제 MongoDB 컬렉션 이름은 소문자+복수형이 기본
        localField: "_id",
        foreignField: "post",
        as: "comments",
      },
    },
  ];

  if (!withComments) {
    pipeline.push(
      {
        $project: {
          comments: 0,
        },
      });
  }

  return await Post.aggregate(pipeline);
}

async function fetchMostCommentedPosts(withComments: boolean) {
  const pipeline: PipelineStage[] = [
    {
      $lookup: {
        from: "comments", // 실제 MongoDB 컬렉션 이름은 소문자+복수형이 기본
        localField: "_id",
        foreignField: "post",
        as: "comments",
      },
    },
    {
      $addFields: {
        commentCount: { $size: "$comments" },
      },
    },
    {
      $sort: {
        commentCount: -1,
      },
    },
  ];

  if (!withComments) {
    pipeline.push(
      {
        $project: {
          comments: 0,
        },
      });
  }

  return await Post.aggregate(pipeline).limit(12);
}

export async function getPosts(sort: SortOption = 'latest', withComments: boolean = false) {
  await connectToDB();

  if (sort === 'latest') {
    return fetchLatestPosts(withComments);
  }
  if (sort === 'popular') {
    return fetchPopularPosts(withComments);
  }
  if (sort === 'commented') {
    return fetchMostCommentedPosts(withComments);
  }

  // 기본 fallback
  return fetchLatestPosts(withComments);
}
