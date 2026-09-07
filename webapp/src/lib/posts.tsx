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
 * The private-post (isPrivate) filter fragment. Logged out or someone else sees public posts only; a logged-in author
 * sees public plus their own private ones.
 * Spread into a Mongo match. A pure function (testable).
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
    // **Always escaped** (#232). Using what the user typed directly as a regex makes one `(` an invalid regex and a 500,
    // while `.*` would act as a wildcard.
    matchStage.$match.title = { $regex: escapeRegex(query), $options: "i" };
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

/**
 * Aggregates the tags and their counts.
 *
 * Given `viewerEmail` it **also counts the tags on that person's private posts** (#230). The individual tag page
 * (`/tags/[tag]`) worked that way from the start while only the cloud excluded them outright, so typing the address
 * directly showed the posts while the tag that would take you there was missing from the cloud.
 *
 * **The argument is optional.** A background job with no viewer, such as `lib/tags/suggest-tags.ts`, just calls it,
 * and `privacyMatch(undefined)` = public only, exactly as before.
 *
 * Someone else's private posts never match in any case - that is how `privacyMatch` is built.
 */
export async function __getAllTags(
  viewerEmail?: string | null,
): Promise<{ tag: string; count: number }[]> {
  const pipeline: PipelineStage[] = [
    {
      $match: {
        isDeleted: { $ne: true },
        tags: { $exists: true, $ne: [] },
        ...privacyMatch(viewerEmail),
      },
    },
    { $unwind: '$tags' },
    {
      $group: {
        // group by tag, lowercased
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

export async function getAllTags(
  viewerEmail?: string | null,
): Promise<{ tag: string; count: number }[]> {
  await connectToDB();
  return __getAllTags(viewerEmail);
}

/**
 * @param query the title search term (#232). It is **the last, optional argument**, so existing callers are unchanged.
 *   Whitespace only counts as absent - clearing the search box must return the full list.
 */
export async function getPaginatedPosts(page: number, limit: number, sort: SortOption = 'latest', userEmail: string | null | undefined = null, withComments: boolean = false, viewerEmail: string | null | undefined = null, query: string | null | undefined = null): Promise<{
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
    query: query?.trim() || undefined,
  });
}

// `searchPosts` was removed (#232). It was dead code with no callers, did the same job as `getPaginatedPosts`, and
// **took no viewerEmail, so it could not find the author's own private posts.**
// Leaving it risked it being wired up when search was eventually added.

export async function myPosts(userEmail: string | null | undefined, sort: SortOption = 'latest', page: number, limit: number, withComments: boolean = false): Promise<{
  total: number;
  posts: GetPostType[];
}> {
  if (!userEmail) {
    throw new Error("User email is required to fetch posts.");
  }

  // The author's own dashboard - their private posts must show, so viewerEmail is themselves.
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
 * The _ids of every undeleted post. Used by post/view's generateStaticParams to build the paths for ISR static
 * generation (posts written after the build are handled on demand through dynamicParams).
 */
export async function getAllPostIds(): Promise<string[]> {
  await connectToDB();
  // Private posts are excluded from static generation (so no public cache leaks) - the view page renders them dynamically, authenticated.
  const posts = await Post.find({ isDeleted: { $ne: true }, isPrivate: { $ne: true } }, '_id').lean();
  return posts.map((p) => String(p._id));
}


/**
 * Finds every post carrying a given tag.
 * @param tag the tag string to search for
 * @returns the posts with that tag
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
    matchStage.$match["tags"] = { $regex: new RegExp(`^${escapeRegex(tag)}$`, 'iu') }; // an exact, case-insensitive tag match
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
