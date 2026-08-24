// 덧글 알림 (#237).
//
// 내 글에 덧글이 달리거나 내 덧글에 답글이 달려도 알 방법이 없었다. AI 팀 스레드가 전부
// 덧글로 오가면서 실질적으로 걸렸다 — 밤에 러너가 답글을 남겨도 확인할 길이 없었다.
//
// ── 쓸 때 만들지 않고, 읽을 때 계산한다 ─────────────────────────────────
//
// 덧글을 만드는 경로가 **넷**이다: /api/comments, /api/enji, /api/painter,
// /api/ai-team/comment. 거기에 "알림 문서도 하나 만들어라"를 넣으면 **다섯 번째 경로가
// 생길 때 조용히 빠진다** — 비공개 규칙이 8곳에 흩어져 있다가 샜던 것(#168)과 같은 모양이다.
// 조회로 계산하면 그 위험이 0 이고, 글 172건 규모면 성능도 충분하다.
import { Types } from 'mongoose';
import { connectToDB } from '@/lib/db';
import Comment from '@/models/comment';
import Post from '@/models/post';
import User from '@/models/user';
import { truncate } from '@/lib/truncate';

/** 목록에 보여 줄 개수. 사라지지 않게 항상 최근 것을 이만큼 준다. */
const DEFAULT_LIMIT = 20;

/**
 * 발췌 상한 (#245).
 *
 * **표시 길이를 정하는 값이 아니다** — 화면 폭은 기기마다 다른데 서버는 그걸 모른다.
 * 서버가 어떤 숫자를 고르든 어떤 폭에서는 어긋난다(60자로 잘랐더니 1504px 데스크톱에서
 * 절반도 못 채우고 오른쪽이 텅 비었다).
 *
 * 실제로 자르는 것은 화면의 `truncate`(text-overflow: ellipsis)다 — 각 기기의 실제 폭에
 * 맞춰 한 줄로 줄여 준다. 글 제목 줄이 이미 그 방식이다. 여기 값은 **응답 크기 상한**일
 * 뿐이고, 넓은 화면 한 줄을 채우고도 남을 만큼만 넉넉하면 된다.
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
 * 내게 온 덧글을 고르는 조건.
 *
 * 순수 함수로 뗀 이유: 이 기능에서 **가장 틀리기 쉬운 곳**이라 따로 테스트한다.
 *
 * `authorId: { $ne }` 가 **null 과 필드 없음까지 포함**한다(실측 확인). 그래서 봇 덧글
 * (`authorId: null`)과 익명 덧글이 정상적으로 걸리고, 내가 쓴 것만 빠진다 —
 * **봇 답글을 아는 게 이 기능의 주 용도다.**
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

/** 내게 온 알림 목록과 안 읽은 수. 비공개 글은 내 것만 걸리므로 남의 것이 샐 구조가 아니다. */
export async function listNotifications(
  email: string,
  limit: number = DEFAULT_LIMIT,
): Promise<{ unreadCount: number; items: NotificationItem[] }> {
  await connectToDB();

  const me = await User.findOne({ email })
    .select('_id notificationsSeenAt')
    .lean<{ _id: Types.ObjectId; notificationsSeenAt?: Date } | null>();
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
  // 한 번도 안 봤으면 전부 새 것이다.
  const seenAt = me.notificationsSeenAt ?? new Date(0);

  const rows = (await Comment.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<CommentRow[]>()) ?? [];

  // 안 읽은 수는 따로 센다 — 목록 20건 안에서 세면 그보다 많을 때 실제보다 적게 나온다.
  const unreadCount = await Comment.countDocuments({ ...filter, createdAt: { $gt: seenAt } });

  // 제목은 **결과에 실제로 나온 글**로 다시 조회한다. 내 덧글의 답글은 남의 글에 달렸을
  // 수도 있어서 내 글 목록만으로는 제목이 비게 된다.
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
      isUnread: !!r.createdAt && new Date(r.createdAt) > seenAt,
      isBot: r.isEnji === true,
    })),
  };
}
