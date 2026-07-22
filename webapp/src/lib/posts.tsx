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
 * 비공개(isPrivate) 글 필터 조각. 비로그인/타인은 공개 글만, 로그인한 작성자는 공개 ∪ 본인 비공개.
 * Mongo match 에 spread 로 병합해 쓴다. 순수 함수(테스트 가능).
 */
export function privacyMatch(viewerEmail?: string | null): Record<string, unknown> {
  return viewerEmail
    ? { $or: [{ isPrivate: { $ne: true } }, { userEmail: viewerEmail }] }
    : { isPrivate: { $ne: true } };
}

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
  const { userEmail, viewerEmail, query, withComments, page = 1, limit = 12, sort = 'latest' } = params;

  const matchStage: PipelineStage.Match = {
    $match: {
      isDeleted: { $ne: true }, // Soft-deleted posts are excluded by default
      ...privacyMatch(viewerEmail), // 비공개 글은 작성자 본인에게만
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
  // When sort === 'commented', comments are already joined before this stage for sorting.
  // Only re-join when comments data is actually needed and not yet present.
  const dataStages: PipelineStage[] = [
    { $skip: (page - 1) * limit },
    { $limit: limit },
  ];
  if (sort !== 'commented' && withComments) {
    dataStages.push({
      $lookup: {
        from: "comments",
        localField: "_id",
        foreignField: "post",
        as: "comments",
      },
    });
  }
  dataStages.push(
    {
      $addFields: {
        ...(withComments && { commentCount: { $size: "$comments" } }),
        _id: { $toString: "$_id" },
      },
    },
    { $project: { comments: 0 } }
  );

  pipeline.push({
    $facet: {
      metadata: [{ $count: "total" }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: dataStages as any,
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

export async function getPosts(sort: SortOption = 'latest', withComments: boolean = false, viewerEmail: string | null | undefined = null): Promise<{
  total: number;
  posts: GetPostType[];
}> {
  await connectToDB();
  return __fetchPosts({
    page: 1,
    limit: 12,
    sort: sort || 'latest',
    withComments: withComments || false,
    viewerEmail: viewerEmail || undefined,
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
        isPrivate: { $ne: true }, // 비공개 글의 태그는 클라우드/집계에 노출하지 않음
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

export async function getPaginatedPosts(page: number, limit: number, sort: SortOption = 'latest', userEmail: string | null | undefined = null, withComments: boolean = false, viewerEmail: string | null | undefined = null): Promise<{
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
    viewerEmail: viewerEmail || undefined,
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

  // 작성자 본인 대시보드 — 자기 비공개 글도 보여야 하므로 viewerEmail 도 본인.
  return await getPaginatedPosts(page, limit, sort, userEmail, withComments, userEmail);
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

export async function getPost(_id: string, viewerEmail?: string | null): Promise<{ post: GetPostType; } | null> {
  try {
    await connectToDB();
    // Fetch only if not soft-deleted, and (public OR viewer is the author for private).
    const post = await Post.findOne({ _id, isDeleted: { $ne: true }, ...privacyMatch(viewerEmail) }).lean<GetPostType>();

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
    // Do not increment views for a deleted or private post
    await Post.findOneAndUpdate({ _id, isDeleted: { $ne: true }, isPrivate: { $ne: true } }, { $inc: { views: 1 } });
  } catch (error) {
    console.error("Error on <updatePostViews>", error);
  }
}

/**
 * 삭제되지 않은 모든 글의 _id 목록. post/view 의 generateStaticParams 에서
 * ISR 정적 생성 대상 경로를 만드는 데 쓴다(빌드 후 작성된 글은 dynamicParams 로 on-demand).
 */
export async function getAllPostIds(): Promise<string[]> {
  await connectToDB();
  // 비공개 글은 정적 생성 대상에서 제외(공개 캐시 유출 방지) — 뷰 페이지가 동적으로 인증 렌더.
  const posts = await Post.find({ isDeleted: { $ne: true }, isPrivate: { $ne: true } }, '_id').lean();
  return posts.map((p) => String(p._id));
}


/**
 * 특정 태그를 포함하는 모든 게시글을 검색합니다.
 * @param tag 검색할 태그 문자열
 * @returns 해당 태그를 가진 게시글의 배열
 */
export async function getPostsByTag(tag: string, viewerEmail?: string | null): Promise<{
  total: number;
  posts: GetPostType[];
}> {
  await connectToDB();

  const matchStage: PipelineStage.Match = {
    $match: {
      isDeleted: { $ne: true }, // Exclude soft-deleted posts
      ...privacyMatch(viewerEmail), // 비공개 글은 작성자 본인에게만
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
