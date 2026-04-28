import { connectToDB } from "@/lib/db";
import Post from "@/models/post";
import User from "@/models/user";
import Comment from "@/models/comment";
import { SortOption } from "./sort";
import { PipelineStage } from "mongoose";
import { GetPostType, SetPostQuery } from "@/types/posts.d";
import { escapeRegex } from "@/lib/utils";
import { env } from "@/lib/env";

/**
 * A centralized function to fetch posts based on various criteria.
 * It dynamically builds a MongoDB aggregation pipeline to filter out soft-deleted posts.
 * @param params - Query parameters including sorting, pagination, and filtering.
 * @returns A promise that resolves to an object containing the posts and the total count.
 */
async function __fetchPosts(params: SetPostQuery): Promise<{
  total: number;
  posts: GetPostType[];
}> {
  const { userEmail, query, withComments, page = 1, limit = 12, sort = 'latest' } = params;

  const matchStage: PipelineStage.Match = {
    $match: {
      isDeleted: { $ne: true } // Soft-deleted posts are excluded by default
    },
  };

  if (userEmail) {
    matchStage.$match.userEmail = userEmail;
  }

  if (query) {
    matchStage.$match.title = { $regex: query, $options: "i" };
  }

  const pipeline: PipelineStage[] = [matchStage];

  // Dynamically build the pipeline based on the sort option
  const sortStage: PipelineStage.Sort = { $sort: {} };
  if (sort === 'commented') {
    pipeline.push(
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
      }
    );
    sortStage.$sort.commentCount = -1;
  } else if (sort === 'popular') {
    sortStage.$sort.views = -1;
  } else { // 'latest'
    sortStage.$sort.createdAt = -1;
  }
  pipeline.push(sortStage);

  // Facet for pagination and metadata
  pipeline.push({
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
            _id: { $toString: "$_id" }, // Convert _id to string
          },
        },
        {
          $project: {
            comments: 0,
          },
        },
      ],
    },
  });

  pipeline.push({
    $project: {
      posts: "$data",
      total: { $ifNull: [{ $arrayElemAt: ["$metadata.total", 0] }, 0] },
    },
  });

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
  return __fetchPosts({
    page: 1,
    limit: 12,
    sort: sort || 'latest',
    withComments: withComments || false,
  });
}

export async function getAllPosts(): Promise<{ id: string; createdAt: Date }[]> {
  await connectToDB();

  const result = await __fetchPosts({
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

export async function __getAllTags(): Promise<{ tag: string; count: number }[]> {
  const pipeline: PipelineStage[] = [
    {
      $match: {
        isDeleted: { $ne: true },
        tags: { $exists: true, $ne: [] },
      },
    },
    { $unwind: '$tags' },
    {
      $group: {
        // tags 값을 모두 소문자로 변환하여 그룹화
        _id: { $toLower: '$tags' }, 
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        tag: '$_id',
        count: 1,
      },
    },
  ];

  const result = await Post.aggregate<{ tag: string; count: number }>(pipeline);
  return result;
}

export async function getAllTags(): Promise<{ tag: string; count: number }[]> {
  await connectToDB();
  return __getAllTags();
}

export async function getPaginatedPosts(page: number, limit: number, sort: SortOption = 'latest', userEmail: string | null | undefined = null, withComments: boolean = false): Promise<{
  total: number;
  posts: GetPostType[];
}> {
  await connectToDB();
  return __fetchPosts({
    page: page || 1,
    limit: limit || 12,
    sort: sort || 'latest',
    withComments: withComments || false,
    userEmail: userEmail || undefined,
  });
}

export async function searchPosts(query: string, sort: SortOption = 'latest', withComments: boolean = false): Promise<{
  total: number;
  posts: GetPostType[];
}> {
  await connectToDB();
  return __fetchPosts({
    page: 1,
    limit: 12,
    query: query || '',
    sort: sort || 'latest',
    withComments: withComments || false,
  });
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
  const DELETE_POST_COST = env.points.deletePostCost;

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

    // Soft delete the post and its comments
    await Post.findByIdAndUpdate(postId, {
      $set: { isDeleted: true, deletedAt: new Date() }
    });
    await Comment.updateMany({ post: postId }, { $set: { isDeleted: true } });

    await User.updateOne({ _id: user._id }, { $inc: { points: -DELETE_POST_COST } });

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
    // Fetch only if not soft-deleted
    const post = await Post.findOne({ _id, isDeleted: { $ne: true } }).lean<GetPostType>();

    if (!post) {
      console.warn(`Post with ID ${_id} not found or has been deleted.`);
      return null;
    }

    return { post: { ...post, _id: post._id.toString() } };
  } catch (error) {
    console.error("Error on <getPost>", error);
    return null;
  }
}

export async function updatePostViews(_id: string): Promise<void> {
  try {
    await connectToDB();
    // Do not increment views for a deleted post
    await Post.findOneAndUpdate({ _id, isDeleted: { $ne: true } }, { $inc: { views: 1 } });
  } catch (error) {
    console.error("Error on <updatePostViews>", error);
  }
}


/**
 * 특정 태그를 포함하는 모든 게시글을 검색합니다.
 * @param tag 검색할 태그 문자열
 * @returns 해당 태그를 가진 게시글의 배열
 */
export async function getPostsByTag(tag: string): Promise<{
  total: number;
  posts: GetPostType[];
}> {
  await connectToDB();

  const matchStage: PipelineStage.Match = {
    $match: {
      isDeleted: { $ne: true } // Exclude soft-deleted posts
    },
  };

  if (tag) {
    matchStage.$match["tags"] = { $regex: new RegExp(`^${escapeRegex(tag)}$`, 'iu') }; // 대소문자 구분 없이 정확히 일치하는 태그 검색
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
              tags: 0,
              urls: 0,
              createdAt: 0,
              updatedAt: 0,
              htmlContent: 0,
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
