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
import { notificationHref } from '@/lib/comment-anchor';
import MarkSeen from './mark-seen';

export const metadata: Metadata = { title: '알림' };

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/');

  const { items } = await listNotifications(session.user.email);
  const now = new Date();

  return (
    // 루트 레이아웃이 이미 <main> 으로 감싸므로 여기선 div (main 중첩 금지, #239).
    //
    // 헤더·홈과 같은 사이트 표준 폭 (#243). max-w-3xl 을 주면 데스크톱에서도 모바일 폭으로
    // 좁게 나온다. 예전에 상한을 빼자 항목이 화면을 가로지른 적이 있는데(#241) 그 원인은
    // 폭이 아니라 시각의 ml-auto 였고 이미 고쳤다.
    <div className="lg:container mx-auto px-4 py-8">
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
                // 메인 말풍선과 같은 섹션 앵커로 간 뒤, CommentAnchor 가 그 덧글까지 더 스크롤한다 (#243).
                href={notificationHref(n.postId, n.id)}
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
                  <span className="mt-1 block truncate text-sm text-gray-600 dark:text-gray-300">
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
