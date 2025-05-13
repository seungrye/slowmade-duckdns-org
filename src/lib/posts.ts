import { connectToDB } from "@/lib/db";
import Post from "@/models/post";
import { SortOption } from "./sort";
import { PipelineStage } from "mongoose";

async function fetchLatestPosts(userEmail: string | undefined, query: string | undefined, withComments: boolean) {
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

  return await Post.aggregate(pipeline);
}

async function fetchPopularPosts(userEmail: string | undefined, query: string | undefined, withComments: boolean) {
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

  return await Post.aggregate(pipeline);
}

async function fetchMostCommentedPosts(userEmail: string | undefined, query: string | undefined, withComments: boolean) {
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

export async function getPosts(sort: SortOption = 'latest', withComments: boolean = false) {
  await connectToDB();

  if (sort === 'latest') {
    return fetchLatestPosts(undefined, undefined, withComments);
  }
  if (sort === 'popular') {
    return fetchPopularPosts(undefined, undefined, withComments);
  }
  if (sort === 'commented') {
    return fetchMostCommentedPosts(undefined, undefined, withComments);
  }

  // 기본 fallback
  return fetchLatestPosts(undefined, undefined, withComments);
}

export async function searchPosts(query: string, sort: SortOption = 'latest', withComments: boolean = false) {
  await connectToDB();

  if (sort === 'latest') {
    return fetchLatestPosts(undefined, query, withComments);
  }
  if (sort === 'popular') {
    return fetchPopularPosts(undefined, query, withComments);
  }
  if (sort === 'commented') {
    return fetchMostCommentedPosts(undefined, query, withComments);
  }

  // 기본 fallback
  return fetchLatestPosts(undefined, query, withComments);
}

export async function myPosts(userEmail: string | null | undefined, sort: SortOption = 'latest', withComments: boolean = false) {
  if (!userEmail) {
    throw new Error("User email is required to fetch posts.");
  }

  await connectToDB();

  if (sort === 'latest') {
    return fetchLatestPosts(userEmail, undefined, withComments);
  }
  if (sort === 'popular') {
    return fetchPopularPosts(userEmail, undefined, withComments);
  }
  if (sort === 'commented') {
    return fetchMostCommentedPosts(userEmail, undefined, withComments);
  }

  // 기본 fallback
  return fetchLatestPosts(userEmail, undefined, withComments);
}