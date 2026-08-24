export const dynamic = 'force-dynamic';

// 알림 목록 (#237).
//
// 항목을 누르면 메인 말풍선과 같은 섹션 앵커로 간 뒤, CommentAnchor 가 그 덧글까지 더
// 스크롤한다 (#243).
//
// **읽음은 "봤다"가 아니라 "처리했다"다 (#247).** 예전엔 페이지를 여는 것만으로 전부 읽음이
// 돼서(`MarkSeen`), 안 읽음 표시가 새 덧글이 온 뒤 첫 렌더 한 번만 살아있고 새로고침하면
// 사라졌다 — 표식을 진하게 해 봐야 정작 볼 때는 볼 것이 없었다. 이제 항목을 눌렀을 때
// 그것만 읽음이 되고, 한꺼번에 정리하려면 [모두 읽음] 을 누른다.

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
    // 루트 레이아웃이 이미 <main> 으로 감싸므로 여기선 div (main 중첩 금지, #239).
    //
    // 헤더·홈과 같은 사이트 표준 폭 (#243). max-w-3xl 을 주면 데스크톱에서도 모바일 폭으로
    // 좁게 나온다. 예전에 상한을 빼자 항목이 화면을 가로지른 적이 있는데(#241) 그 원인은
    // 폭이 아니라 시각의 ml-auto 였고 이미 고쳤다.
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
                // 안 읽음은 배경 틴트 + 왼쪽 파란 띠로 구분한다 (#247). 점·굵은 글씨만으로는
                // 훑을 때 눈에 안 들어왔다. 읽은 항목도 같은 두께의 투명 띠를 둬서 글이
                // 좌우로 밀리지 않게 한다.
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
