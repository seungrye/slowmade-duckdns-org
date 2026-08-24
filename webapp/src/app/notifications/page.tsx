export const dynamic = 'force-dynamic';

// 알림 목록 (#237).
//
// 항목을 누르면 `/post/view/<글id>#comment-<덧글id>` 로 간다 — 덧글에 이미 앵커가 있어서
// (`comment-item.tsx`) 그 덧글로 바로 스크롤된다. 따로 만들 것이 없었다.

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { listNotifications } from '@/lib/notifications';
import { relativeTime } from '@/lib/relative-time';
import MarkSeen from './mark-seen';

export const metadata: Metadata = { title: '알림' };

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/');

  const { items } = await listNotifications(session.user.email);
  const now = new Date();

  return (
    // 루트 레이아웃이 이미 <main> 으로 감싸므로 여기선 div (main 중첩 금지, #239).
    // max-w-3xl 을 빼고 tags·홈과 같은 `mx-auto px-4` 로 — 그것만 있으면 넓은 화면에서
    // 혼자 가운데로 몰려 다른 페이지와 좌측 정렬이 어긋난다(#241).
    <div className="mx-auto px-4 py-8">
      {/* 목록을 그린 뒤에 읽음 처리 — 그래야 무엇이 새 것이었는지 보인다. */}
      <MarkSeen />

      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">알림</h1>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
          아직 온 알림이 없습니다.
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={`/post/view/${n.postId}#comment-${n.id}`}
                className="flex gap-3 px-1 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
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
                    <span className="ml-auto shrink-0 text-xs text-gray-500 dark:text-gray-400">
                      {n.createdAt ? relativeTime(n.createdAt, now) : ''}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                    {n.postTitle}
                  </span>
                  <span className="mt-1 block text-sm text-gray-600 dark:text-gray-300">
                    {n.excerpt}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
