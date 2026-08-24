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
