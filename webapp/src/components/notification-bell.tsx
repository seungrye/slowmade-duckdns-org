'use client';

// The notification bell (#237).
//
// **The list is not drawn here.** navbar holds two sets of markup, desktop and mobile, across 595 lines,
// so a dropdown would have to be attached in both places and would feel cramped on a narrow screen. This shows the number alone and
// sends you to `/notifications` - so the navbar change is one line.

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
    // Once on entering the page is enough. Polling is added when it becomes necessary.
    fetch('/api/notifications')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setCount(d?.data?.unreadCount ?? 0); })
      .catch(() => { /* 알림 때문에 화면이 깨지면 안 된다 */ });
    return () => { cancelled = true; };
  }, [session]);

  // It follows the read marking at once (#259).
  //
  // This component lives in the navbar and is **not remounted** by navigation. So with the fetch above alone,
  // pressing a notification and reading it left the number as it was - it changed only on a refresh. It listens for the signal
  // the list sends and decrements at once. Even if it drifts, the next fetch brings it back to the server's value.
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
