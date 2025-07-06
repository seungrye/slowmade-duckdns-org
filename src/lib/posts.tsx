import { connectToDB } from "@/lib/db";
import Post from "@/models/post";
import User from "@/models/user";
import Comment from "@/models/comment";
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
          {
            $addFields: {
              ...(withComments && { commentCount: { $size: "$comments" } }),
            },
          },
          {
            $project: {
              jsonContent: 0,
              comments: 0,
            },
          }
        ],
      },
    },
    {
      $project: {
        posts: "$data",
        total: { $arrayElemAt: ["$metadata.total", 0] },
      },
    },
    {
      $addFields: {
        posts: {
          $map: {
            input: "$posts",
            as: "post",
            in: {
              $mergeObjects: ["$$post", { _id: { $toString: "$$post._id" } }],
            },
          },
        },
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
          {
            $addFields: {
              ...(withComments && { commentCount: { $size: "$comments" } }),
            },
          },
          {
            $project: {
              jsonContent: 0,
              comments: 0,
            },
          }
        ],
      },
    },
    {
      $project: {
        posts: "$data",
        total: { $ifNull: [{ $arrayElemAt: ["$metadata.total", 0] }, 0] },
      },
    },
    {
      $addFields: {
        posts: {
          $map: {
            input: "$posts",
            as: "post",
            in: {
              $mergeObjects: ["$$post", { _id: { $toString: "$$post._id" } }],
            },
          },
        },
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
  const { userEmail, query, page = 1, limit = 12 } = params;

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
          {
            $project: {
              jsonContent: 0,
              comments: 0,
            },
          }
        ],
      },
    },
    {
      $project: {
        posts: "$data",
        total: { $ifNull: [{ $arrayElemAt: ["$metadata.total", 0] }, 0] },
      },
    },
    {
      $addFields: {
        posts: {
          $map: {
            input: "$posts",
            as: "post",
            in: {
              $mergeObjects: ["$$post", { _id: { $toString: "$$post._id" } }],
            },
          },
        },
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

export async function getAllPosts(): Promise<{ id: string; createdAt: Date }[]> {
  await connectToDB();

  const result = await fetchLatestPosts({
    page: 1,
    limit: 1000, // 모든 게시물을 가져오기 위해 충분히 큰 limit 설정
    sort: 'latest',
    withComments: false,
  });

  return result.posts.map((post: GetPostType) => ({
    id: post._id.toString(),
    createdAt: post.createdAt,
  }));
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

export async function myPosts(userEmail: string | null | undefined, sort: SortOption = 'latest', page: number, limit: number, withComments: boolean = false): Promise<{
  total: number;
  posts: GetPostType[];
}> {
  if (!userEmail) {
    throw new Error("User email is required to fetch posts.");
  }

  return await getPaginatedPosts(page, limit, sort, userEmail, withComments);
}

export async function deletePost(postId: string, userEmail: string): Promise<{ success: boolean; message: string; }> {
  const DELETE_POST_COST = parseInt(process.env.DELETE_POST_COST || '7', 10);

  await connectToDB();

  try {
    const user = await User.findOne({ email: userEmail });

    if (!user) {
      throw new Error("사용자를 찾을 수 없습니다.");
    }

    if (user.points < DELETE_POST_COST) {
      throw new Error(`게시글을 삭제하려면 ${DELETE_POST_COST}포인트가 필요합니다. (보유 포인트: ${user.points})`);
    }

    const post = await Post.findById(postId);

    if (!post) {
      throw new Error("게시글을 찾을 수 없습니다.");
    }

    if (post.userEmail !== userEmail) {
      throw new Error("게시글을 삭제할 권한이 없습니다.");
    }

    // 참고: MongoDB Replica Set이 아닌 환경에서는 트랜잭션이 지원되지 않습니다.
    // 아래 작업들은 개별적으로 실행되며, 하나가 실패해도 이전에 성공한 작업이 롤백되지 않습니다.
    await User.updateOne({ _id: user._id }, { $inc: { points: -DELETE_POST_COST } });
    await Post.findByIdAndDelete(postId);
    await Comment.deleteMany({ post: postId });

    return { success: true, message: "게시글이 성공적으로 삭제되었습니다." };
  } catch (error) {
    console.error("Error deleting post:", error);
    const message = error instanceof Error ? error.message : "게시글 삭제 중 오류가 발생했습니다.";
    return { success: false, message };
  }
}

export async function getPost(_id: string): Promise<{ post: GetPostType; } | null> {
  try {
    await connectToDB();
    const post = await Post.findById(_id);
    return { post };
  } catch (error) {
    console.error("Error on <getPost>", error);
    return null;
  }
}

export async function updatePostViews(_id: string): Promise<void> {
  try {
    await connectToDB();
    await Post.findByIdAndUpdate(_id, { $inc: { views: 1 } }, { new: true });
  } catch (error) {
    console.error("Error on <updatePostViews>", error);
  }
}

/**
 * 특정 태그를 포함하는 모든 게시글을 검색합니다.
 * @param tag 검색할 태그 문자열
 * @returns 해당 태그를 가진 게시글의 배열
 */
export async function getPostsByTag(tag: string):  Promise<{
  total: number;
  posts: GetPostType[];
}> {
  await connectToDB();

  const matchStage: PipelineStage.Match = {
    $match: {},
  };

  if (tag) {
    matchStage.$match["tags"] = { $regex: new RegExp(`^${tag}$`, 'i') }; // 대소문자 구분 없이 정확히 일치하는 태그 검색
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
            $project: {
              tags: 0, // 태그는 필요 없으므로 제외
              urls: 0,
              createdAt: 0,
              updatedAt: 0,
              htmlContent: 0,
              jsonContent: 0,
              comments: 0,
            },
          }
        ],
      },
    },
    {
      $project: {
        posts: "$data",
        total: { $arrayElemAt: ["$metadata.total", 0] },
      },
    },
    {
      $addFields: {
        posts: {
          $map: {
            input: "$posts",
            as: "post",
            in: {
              $mergeObjects: ["$$post", { _id: { $toString: "$$post._id" } }],
            },
          },
        },
      },
    },
  ];

  const [result] = await Post.aggregate(pipeline);

  console.log("getPostsByTag result:", result);

  return {
    posts: result?.posts || [],
    total: result?.total || 0,
  };
}
