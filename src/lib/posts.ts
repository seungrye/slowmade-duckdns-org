import { connectToDB } from "@/lib/db";
import Post from "@/models/post";
import { SortOption } from "./sort";
import { PipelineStage } from "mongoose";
import { GetPostType } from "@/types/posts.d";

async function fetchLatestPosts(userEmail: string | undefined, query: string | undefined, withComments: boolean): Promise<GetPostType[]> {
  const pipeline: PipelineStage[] = [];

  if (userEmail) {
    pipeline.push(
      {
        $match: {
          userEmail: userEmail,
        },
      },
    );
  }

  if (query) {
    pipeline.push(
      {
        $match: {
          title: { $regex: query, $options: "i" }, // 대소문자 구분 없이 검색
        },
      },
    );
  }

  pipeline.push(
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
  );

  if (!withComments) {
    pipeline.push(
      {
        $project: {
          comments: 0,
        },
      });
  }

  const result = await Post.aggregate(pipeline).limit(12);
  return result;
}

async function fetchPopularPosts(userEmail: string | undefined, query: string | undefined, withComments: boolean): Promise<GetPostType[]> {
  const pipeline: PipelineStage[] = [];

  if (userEmail) {
    pipeline.push(
      {
        $match: {
          userEmail: userEmail,
        },
      },
    );
  }

  if (query) {
    pipeline.push(
      {
        $match: {
          title: { $regex: query, $options: "i" }, // 대소문자 구분 없이 검색
        },
      },
    );
  }

  pipeline.push(
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
  );

  if (!withComments) {
    pipeline.push(
      {
        $project: {
          comments: 0,
        },
      });
  }

  const result = await Post.aggregate(pipeline).limit(12);
  return result;
}

async function fetchMostCommentedPosts(userEmail: string | undefined, query: string | undefined, withComments: boolean): Promise<GetPostType[]> {
  const pipeline: PipelineStage[] = [];

  if (userEmail) {
    pipeline.push(
      {
        $match: {
          userEmail: userEmail,
        },
      },
    );
  }

  if (query) {
    pipeline.push(
      {
        $match: {
          title: { $regex: query, $options: "i" }, // 대소문자 구분 없이 검색
        },
      },
    );
  }

  pipeline.push(
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
  );

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

export async function getPosts(sort: SortOption = 'latest', withComments: boolean = false): Promise<GetPostType[]> {
  await connectToDB();

  let result;

  switch (sort) {
    case 'popular':
      result = await fetchPopularPosts(undefined, undefined, withComments);
      break;
    case 'commented':
      result = await fetchMostCommentedPosts(undefined, undefined, withComments);
      break;
    case 'latest':
    default: // 기본 fallback
      result = await fetchLatestPosts(undefined, undefined, withComments);
      break;
  }

  return result;
}

export async function searchPosts(query: string, sort: SortOption = 'latest', withComments: boolean = false): Promise<GetPostType[]> {
  await connectToDB();

  let result;

  switch (sort) {
    case 'popular':
      result = await fetchPopularPosts(undefined, query, withComments);
      break;
    case 'commented':
      result = await fetchMostCommentedPosts(undefined, query, withComments);
      break;
    case 'latest':
    default: // 기본 fallback
      result = await fetchLatestPosts(undefined, query, withComments);
      break;
  }

  return result;
}

export async function myPosts(userEmail: string | null | undefined, sort: SortOption = 'latest', withComments: boolean = false): Promise<GetPostType[]> {
  if (!userEmail) {
    throw new Error("User email is required to fetch posts.");
  }

  await connectToDB();

  let result;

  switch (sort) {
    case 'popular':
      result = await fetchPopularPosts(userEmail, undefined, withComments);
      break;
    case 'commented':
      result = await fetchMostCommentedPosts(userEmail, undefined, withComments);
      break;
    case 'latest':
    default: // 기본 fallback
      result = await fetchLatestPosts(userEmail, undefined, withComments);
      break;
  }

  return result;
}