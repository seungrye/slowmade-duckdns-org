'use client';

// 알림 종 (#237).
//
// **목록은 여기서 그리지 않는다.** navbar 는 595줄에 데스크톱·모바일 마크업이 두 벌이라,
// 드롭다운을 넣으면 두 곳에 각각 붙여야 하고 좁은 화면에서도 답답하다. 여기는 숫자만 보여
// 주고 `/notifications` 로 보낸다 — navbar 변경이 한 줄로 끝난다.

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  NOTIFICATION_READ,
  NOTIFICATIONS_ALL_READ,
  decrementUnread,
} from '@/lib/notification-events';

export default function NotificationBell() {
  const { data: session } = useSession();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    // 페이지 진입 시 한 번이면 충분하다. 폴링은 필요해지면 그때 얹는다.
    fetch('/api/notifications')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setCount(d?.data?.unreadCount ?? 0); })
      .catch(() => { /* 알림 때문에 화면이 깨지면 안 된다 */ });
    return () => { cancelled = true; };
  }, [session]);

  // 읽음 처리를 바로 따라간다 (#259).
  //
  // 이 컴포넌트는 navbar 에 있어 화면을 옮겨도 **다시 마운트되지 않는다.** 그래서 위 조회만
  // 있을 때는 알림을 눌러 읽어도 숫자가 그대로였다 — 새로고침해야 바뀌었다. 목록 쪽이 보내는
  // 신호를 듣고 즉시 줄인다. 어긋나더라도 다음 조회에서 서버 값으로 맞춰진다.
  useEffect(() => {
    const onOne = () => setCount(decrementUnread);
    const onAll = () => setCount(0);
    window.addEventListener(NOTIFICATION_READ, onOne);
    window.addEventListener(NOTIFICATIONS_ALL_READ, onAll);
    return () => {
      window.removeEventListener(NOTIFICATION_READ, onOne);
      window.removeEventListener(NOTIFICATIONS_ALL_READ, onAll);
    };
  }, []);

  if (!session) return null;

  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `알림 ${count}건` : '알림'}
      className="relative inline-flex items-center p-2 text-gray-400 hover:text-gray-200 transition-colors"
    >
      <Bell size={20} />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
