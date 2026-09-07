export const dynamic = 'force-dynamic';

// The notification list (#237).
//
// Pressing an item goes to the same section anchor as the main speech bubble, and CommentAnchor then scrolls
// on to that comment (#243).
//
// **Read means "handled", not "seen" (#247).** Opening the page used to mark everything read
// (`MarkSeen`), so the unread marking survived only the first render after a new comment and vanished
// on a refresh - however bold the marking, there was nothing left to see by the time you looked. Now pressing an item
// marks that one alone, and [mark all read] clears them together.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { listNotifications } from '@/lib/notifications';
import { relativeTime } from '@/lib/relative-time';
import { notificationHref } from '@/lib/comment-anchor';
import NotificationLink from './notification-link';
import MarkAllRead from './mark-all-read';
import RefreshOnReturn from './refresh-on-return';

export const metadata: Metadata = { title: '알림' };

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/');

  const { items, unreadCount } = await listNotifications(session.user.email);
  const now = new Date();

  return (
    // The root layout already wraps this in a <main>, so a div is used here (no nested main, #239).
    //
    // The site's standard width, as on the header and home (#243). max-w-3xl would make it as narrow as
    // mobile even on desktop. Removing the cap once let an item stretch across the screen (#241), but that was caused by
    // the timestamp's ml-auto rather than the width, and it is already fixed.
    <div className="lg:container mx-auto px-4 py-8">
      {/* 눌러서 읽은 뒤 돌아오면 목록을 다시 받아온다 (#259). */}
      <RefreshOnReturn />

      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          알림
          {unreadCount > 0 && (
            <span className="ml-2 align-middle text-sm font-medium text-blue-600 dark:text-blue-400">
              새 알림 {unreadCount}건
            </span>
          )}
        </h1>
        <MarkAllRead unreadCount={unreadCount} />
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
          아직 온 알림이 없습니다.
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {items.map((n) => (
            <li key={n.id}>
              <NotificationLink
                href={notificationHref(n.postId, n.id)}
                id={n.id}
                isUnread={n.isUnread}
                // Unread is distinguished by a background tint plus a blue bar on the left (#247). A dot and bold text alone
                // did not register while scanning. Read items get a transparent bar of the same width so the text
                // does not shift sideways.
                className={`flex gap-3 border-l-2 py-3 pl-3 pr-2 transition-colors ${
                  n.isUnread
                    ? 'border-blue-500 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20'
                    : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/60'
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-2 h-2 w-2 shrink-0 rounded-full ${
                    n.isUnread ? 'bg-blue-500' : 'bg-transparent'
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span
                      className={`truncate text-sm ${
                        n.isUnread
                          ? 'font-semibold text-gray-900 dark:text-gray-100'
                          : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {n.author}
                      {n.isBot && <span className="ml-1 text-xs text-blue-500">✨</span>}
                    </span>
                    {n.isUnread && (
                      <span className="shrink-0 rounded-full bg-blue-500 px-1.5 text-[10px] font-bold leading-4 text-white">
                        NEW
                      </span>
                    )}
                    {/* ml-auto 를 쓰면 넓은 화면에서 시각이 화면 끝까지 밀려 이름과 갈라진다(#241). */}
                    <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                      {n.createdAt ? relativeTime(n.createdAt, now) : ''}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                    {n.postTitle}
                  </span>
                  {/* 자르는 건 CSS 가 한다 (#245). 서버는 넉넉히 보내고 실제 폭에 맞춰
                      여기서 한 줄로 줄인다 — 바로 위 제목 줄과 같은 방식. */}
                  <span
                    className={`mt-1 block truncate text-sm ${
                      n.isUnread
                        ? 'text-gray-800 dark:text-gray-200'
                        : 'text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {n.excerpt}
                  </span>
                </span>
              </NotificationLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
