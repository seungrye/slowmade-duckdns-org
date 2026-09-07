// Comment notifications (#237).
//
// There was no way to know when someone commented on my post or replied to my comment. It became a real problem once
// the AI team thread ran entirely through comments - a runner replying overnight was simply unknowable.
//
// ── Computed on read, not created on write ─────────────────────────────────
//
// There are **three** paths that create a comment: /api/comments, /api/enji and /api/painter.
// Adding "also create a notification document" to each means **a fourth path would silently miss it** - the same
// shape as the privacy rule scattered across 8 places that eventually leaked (#168).
// Computing on read removes that risk entirely, and at 172 posts the performance is fine.
import { Types, type PipelineStage } from 'mongoose';
import { connectToDB } from '@/lib/db';
import Comment from '@/models/comment';
import Post from '@/models/post';
import User from '@/models/user';
import { truncate } from '@/lib/truncate';
import { isUnread, notificationPipeline } from '@/lib/notification-read';

/** How many to show in the list. Always this many of the most recent, so nothing disappears. */
const DEFAULT_LIMIT = 20;

/**
 * The excerpt cap (#245).
 *
 * **It is not the display length** - screen width differs by device and the server does not know it. Whatever number
 * the server picks is wrong at some width (cutting at 60 characters left a 1504px desktop less than half full, with
 * the right side empty).
 *
 * What actually truncates is the UI's `truncate` (text-overflow: ellipsis), which fits one line to each device's real
 * width. The post-title line already works that way. This value is only **a response-size cap**, generous enough to
 * more than fill one line on a wide screen.
 */
const EXCERPT_LENGTH = 200;

export interface NotificationItem {
  id: string;
  postId: string;
  postTitle: string;
  author: string;
  excerpt: string;
  createdAt: Date | string | null;
  isUnread: boolean;
  isBot: boolean;
}

/**
 * The condition that picks the comments addressed to me.
 *
 * Why it is a separate pure function: it is **the easiest thing in this feature to get wrong**, so it is tested on its own.
 *
 * `authorId: { $ne }` **also covers null and a missing field** (measured). That is why bot comments
 * (`authorId: null`) and anonymous comments still match while my own are excluded -
 * **knowing about bot replies is this feature's main purpose.**
 */
export function notificationFilter(
  myId: Types.ObjectId,
  myPostIds: Types.ObjectId[],
  myCommentIds: Types.ObjectId[],
): Record<string, unknown> {
  return {
    isDeleted: { $ne: true },
    authorId: { $ne: myId },
    $or: [
      { post: { $in: myPostIds } },      // 내 글에 달린 덧글
      { parent: { $in: myCommentIds } }, // 내 덧글에 달린 답글
    ],
  };
}

interface CommentRow {
  _id: unknown;
  post: unknown;
  author?: string;
  content?: string;
  isEnji?: boolean;
  createdAt?: Date;
}

/** My notifications and the unread count. Private posts only match my own, so there is no structure for someone else's to leak. */
export async function listNotifications(
  email: string,
  limit: number = DEFAULT_LIMIT,
): Promise<{ unreadCount: number; items: NotificationItem[] }> {
  await connectToDB();

  const me = await User.findOne({ email })
    .select('_id notificationsSeenAt notificationsReadIds')
    .lean<{
      _id: Types.ObjectId;
      notificationsSeenAt?: Date;
      notificationsReadIds?: string[];
    } | null>();
  if (!me) return { unreadCount: 0, items: [] };

  const myPosts = await Post.find({ userEmail: email, isDeleted: { $ne: true } })
    .select('_id')
    .lean<{ _id: Types.ObjectId }[]>();
  const myComments = await Comment.find({ authorId: me._id })
    .select('_id')
    .lean<{ _id: Types.ObjectId }[]>();

  const filter = notificationFilter(
    me._id,
    (myPosts ?? []).map((p) => p._id),
    (myComments ?? []).map((c) => c._id),
  );
  // With nothing ever seen, everything is new.
  const seenAt = me.notificationsSeenAt ?? new Date(0);
  // Among those newer than the baseline, the ones tapped (#247).
  const readIds = new Set(me.notificationsReadIds ?? []);

  // Unread first, then newest (#249). For why the sort happens in the DB see the
  // `notificationPipeline` comment - sorting **before** the slice is what stops unread items being pushed past the
  // limit and disappearing.
  const rows =
    ((await Comment.aggregate(
      // The pipeline is a pure function and knows nothing of mongoose types (which is what lets the test check only its shape).
      notificationPipeline(filter, seenAt, [...readIds], limit) as unknown as PipelineStage[],
    )) as CommentRow[]) ?? [];

  // The unread count is measured separately - counting within the 20-item list would under-report when there are more.
  // Tapped ones are excluded (#247) - the badge must not disagree with the list's markers.
  const unreadCount = await Comment.countDocuments({
    ...filter,
    createdAt: { $gt: seenAt },
    ...(readIds.size > 0 ? { _id: { $nin: [...readIds] } } : {}),
  });

  // Titles are re-queried from **the posts actually in the result**. A reply to my comment can sit on someone else's
  // post, so the list of my own posts alone would leave the title empty.
  const postIds = [...new Set(rows.map((r) => String(r.post)))];
  const posts = (await Post.find({ _id: { $in: postIds } })
    .select('_id title')
    .lean<{ _id: Types.ObjectId; title?: string }[]>()) ?? [];
  const titleById = new Map(posts.map((p) => [String(p._id), p.title ?? '']));

  return {
    unreadCount,
    items: rows.map((r) => ({
      id: String(r._id),
      postId: String(r.post),
      postTitle: titleById.get(String(r.post)) ?? '',
      author: r.author ?? '',
      excerpt: truncate(r.content ?? '', EXCERPT_LENGTH),
      createdAt: r.createdAt ?? null,
      isUnread: isUnread(r.createdAt, seenAt, readIds, String(r._id)),
      isBot: r.isEnji === true,
    })),
  };
}
