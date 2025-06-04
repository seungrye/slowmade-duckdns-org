import { connectToDB } from "@/lib/db";
import Post from "@/models/post";
import { SortOption } from "./sort";
import { PipelineStage } from "mongoose";
import { GetPostType, SetPostQuery } from "@/types/posts.d";

async function fetchLatestPosts(params: SetPostQuery): Promise<GetPostType[]> {
  const { userEmail, query, withComments, page, limit } = params;
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
    }
  )

  // 페이지네이션을 위해 $skip과 $limit을 사용합니다.
  if (page && limit) {
    pipeline.push(
      {
        $skip: (page - 1) * limit, // 페이지네이션을 위해 $skip을 사용합니다.
      },
      {
        $limit: limit, // 페이지당 가져올 문서 수
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

async function fetchPopularPosts(params: SetPostQuery): Promise<GetPostType[]> {
  const { userEmail, query, withComments, page, limit } = params;
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
    }
  )

  // 페이지네이션을 위해 $skip과 $limit을 사용합니다.
  if (page && limit) {
    pipeline.push(
      {
        $skip: (page - 1) * limit, // 페이지네이션을 위해 $skip을 사용합니다.
      },
      {
        $limit: limit, // 페이지당 가져올 문서 수
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

async function fetchMostCommentedPosts(params: SetPostQuery): Promise<GetPostType[]> {
  const { userEmail, query, withComments, page, limit } = params;
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

  // 페이지네이션을 위해 $skip과 $limit을 사용합니다.
  if (page && limit) {
    pipeline.push(
      {
        $skip: (page - 1) * limit, // 페이지네이션을 위해 $skip을 사용합니다.
      },
      {
        $limit: limit, // 페이지당 가져올 문서 수
      },
    );
  }

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

export async function getPosts(sort: SortOption = 'latest', withComments: boolean = false): Promise<GetPostType[]> {
  await connectToDB();

  let result;

  const params: SetPostQuery = {
    page: 1,
    limit: 12,
    sort: sort || 'latest',
    withComments: withComments || false,
  };

  switch (sort) {
    case 'popular':
      result = await fetchPopularPosts(params);
      break;
    case 'commented':
      result = await fetchMostCommentedPosts(params);
      break;
    case 'latest':
    default: // 기본 fallback
      result = await fetchLatestPosts(params);
      break;
  }

  return result;
}

export async function getPaginatedPosts(page: number, limit: number, sort: SortOption = 'latest', withComments: boolean = false): Promise<GetPostType[]> {
  await connectToDB();

  let result;

  const params: SetPostQuery = {
    page: page || 1,
    limit: limit || 12,
    sort: sort || 'latest',
    withComments: withComments || false,
  };

  switch (sort) {
    case 'popular':
      result = await fetchPopularPosts(params);
      break;
    case 'commented':
      result = await fetchMostCommentedPosts(params);
      break;
    case 'latest':
    default: // 기본 fallback
      result = await fetchLatestPosts(params);
      break;
  }

  return result;
}

export async function searchPosts(query: string, sort: SortOption = 'latest', withComments: boolean = false): Promise<GetPostType[]> {
  await connectToDB();

  let result;
  const params: SetPostQuery = {
    page: 1,
    limit: 12,
    query: query || '',
    sort: sort || 'latest',
    withComments: withComments || false,
  };

  switch (sort) {
    case 'popular':
      result = await fetchPopularPosts(params);
      break;
    case 'commented':
      result = await fetchMostCommentedPosts(params);
      break;
    case 'latest':
    default: // 기본 fallback
      result = await fetchLatestPosts(params);
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
  const params: SetPostQuery = {
    page: 1,
    limit: 12,
    userEmail: userEmail,
    sort: sort || 'latest',
    withComments: withComments || false,
  };

  switch (sort) {
    case 'popular':
      result = await fetchPopularPosts(params);
      break;
    case 'commented':
      result = await fetchMostCommentedPosts(params);
      break;
    case 'latest':
    default: // 기본 fallback
      result = await fetchLatestPosts(params);
      break;
  }

  return result;
}