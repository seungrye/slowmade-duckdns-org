import { connectToDB } from "@/lib/db";
import Post from "@/models/post";
import { SortOption } from "./sort";
import { PipelineStage } from "mongoose";
import { GetPostType, SetPostQuery } from "@/types/posts.d";

async function fetchLatestPosts(params: SetPostQuery): Promise<{
  total: number;
  posts: GetPostType[];
}> {
  const { userEmail, query, withComments, page = 1, limit = 12 } = params;

  const matchStage: PipelineStage.Match = {
    $match: {},
  };

  if (userEmail) {
    matchStage.$match["userEmail"] = userEmail;
  }

  if (query) {
    matchStage.$match["title"] = { $regex: query, $options: "i" };
  }

  const pipeline: PipelineStage[] = [
    matchStage,
    {
      $sort: { createdAt: -1 },
    },
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $lookup: {
              from: "comments",
              localField: "_id",
              foreignField: "post",
              as: "comments",
            },
          },
          ...(withComments ? [] : [{ $project: { comments: 0 } }]),
        ],
      },
    },
    {
      $project: {
        posts: "$data",
        total: { $arrayElemAt: ["$metadata.total", 0] },
      },
    },
  ];

  const [result] = await Post.aggregate(pipeline);

  return {
    posts: result?.posts || [],
    total: result?.total || 0,
  };
}

async function fetchPopularPosts(params: SetPostQuery): Promise<{
  total: number;
  posts: GetPostType[];
}> {
  const { userEmail, query, withComments, page = 1, limit = 12 } = params;

  const match: PipelineStage.Match = {
    $match: {},
  };

  if (userEmail) {
    match.$match["userEmail"] = userEmail;
  }

  if (query) {
    match.$match["title"] = { $regex: query, $options: "i" };
  }

  const pipeline: PipelineStage[] = [
    match,
    {
      $sort: { views: -1 },
    },
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $lookup: {
              from: "comments",
              localField: "_id",
              foreignField: "post",
              as: "comments",
            },
          },
          ...(withComments ? [] : [{ $project: { comments: 0 } }]),
        ],
      },
    },
    {
      $project: {
        posts: "$data",
        total: { $ifNull: [{ $arrayElemAt: ["$metadata.total", 0] }, 0] },
      },
    },
  ];

  const [result] = await Post.aggregate(pipeline);

  return {
    posts: result?.posts || [],
    total: result?.total || 0,
  };
}

async function fetchMostCommentedPosts(params: SetPostQuery): Promise<{
  total: number;
  posts: GetPostType[];
}> {
  const { userEmail, query, withComments, page = 1, limit = 12 } = params;

  const match: PipelineStage.Match = {
    $match: {},
  };

  if (userEmail) {
    match.$match["userEmail"] = userEmail;
  }

  if (query) {
    match.$match["title"] = { $regex: query, $options: "i" };
  }

  const pipeline: PipelineStage[] = [
    match,
    {
      $lookup: {
        from: "comments",
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
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          ...(withComments ? [] : [{ $project: { comments: 0 } }]),
        ],
      },
    },
    {
      $project: {
        posts: "$data",
        total: { $ifNull: [{ $arrayElemAt: ["$metadata.total", 0] }, 0] },
      },
    },
  ];

  const [result] = await Post.aggregate(pipeline);

  return {
    posts: result?.posts || [],
    total: result?.total || 0,
  };
}

export async function getPosts(sort: SortOption = 'latest', withComments: boolean = false): Promise<{
  total: number;
  posts: GetPostType[];
}> {
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

export async function getPaginatedPosts(page: number, limit: number, sort: SortOption = 'latest', userEmail: string | null | undefined = null, withComments: boolean = false): Promise<{
  total: number;
  posts: GetPostType[];
}> {
  await connectToDB();

  let result;

  const params: SetPostQuery = {
    page: page || 1,
    limit: limit || 12,
    sort: sort || 'latest',
    withComments: withComments || false,
  };

  if (userEmail) { params.userEmail = userEmail; }

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

export async function searchPosts(query: string, sort: SortOption = 'latest', withComments: boolean = false): Promise<{
  total: number;
  posts: GetPostType[];
}> {
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

export async function myPosts(userEmail: string | null | undefined, sort: SortOption = 'latest', withComments: boolean = false): Promise<{
  total: number;
  posts: GetPostType[];
}> {
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