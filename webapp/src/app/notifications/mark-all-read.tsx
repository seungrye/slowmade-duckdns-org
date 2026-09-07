'use client';

// [mark all read] (#247).
//
// This used to run automatically just from opening the page (`MarkSeen`), so the "unread"
// marking survived only the first render. Now it happens **only on a press** - for clearing everything at once.
//
// With nothing unread it is not drawn at all. There is no need for a button with no reason to press it.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { emitNotificationsAllRead } from '@/lib/notification-events';

export default function MarkAllRead({ unreadCount }: { unreadCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (unreadCount === 0) return null;

  const markAll = async () => {
    setBusy(true);
    try {
      await fetch('/api/notifications/seen', { method: 'POST' });
      // The list is redrawn by refresh, but the bell lives in the navbar and stays as it was (#259).
      // Measured: the list went to 0 while the badge still read 3.
      emitNotificationsAllRead();
      router.refresh();
    } catch {
      // 실패해도 목록은 그대로다. 다시 누르면 된다.
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={markAll}
      disabled={busy}
      className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
    >
      모두 읽음
    </button>
  );
}
