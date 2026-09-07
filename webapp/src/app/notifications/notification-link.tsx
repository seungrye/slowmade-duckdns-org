'use client';

// A notification item (#247).
//
// Pressing it marks **that item alone** read and goes to the comment. Opening the page used to mark
// everything read, so the marking vanished on a single refresh - there was no telling what was still unseen.
//
// It is sent with `keepalive`. The screen navigates right after the click, and without this the browser
// cuts the request off as it navigates, quietly losing the read marking.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { emitNotificationRead } from '@/lib/notification-events';

export default function NotificationLink({
  href,
  id,
  isUnread,
  className,
  children,
}: {
  href: string;
  id: string;
  isUnread: boolean;
  className?: string;
  children: ReactNode;
}) {
  const markRead = () => {
    // It notifies **the moment it is pressed**, without waiting for the server (#259) - the bell is in the navbar and is
    // not remounted by navigation, so without being told the number stays put until a refresh.
    // Only unread items are counted, so pressing an already-read one does not subtract.
    if (isUnread) emitNotificationRead();
    fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
      keepalive: true,
    }).catch(() => {
      // 실패해도 덧글로는 간다. 다음에 다시 안 읽음으로 보일 뿐이다.
    });
  };

  return (
    <Link href={href} onClick={markRead} className={className}>
      {children}
    </Link>
  );
}
