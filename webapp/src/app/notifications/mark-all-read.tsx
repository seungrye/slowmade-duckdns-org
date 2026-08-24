'use client';

// [모두 읽음] (#247).
//
// 예전엔 페이지를 여는 것만으로 이 동작이 자동 실행됐다(`MarkSeen`). 그래서 "안 읽음"
// 표시가 첫 렌더 한 번만 살아있었다. 이제 **누를 때만** 한다 — 한꺼번에 정리하고 싶을 때.
//
// 안 읽은 것이 없으면 아예 그리지 않는다. 누를 이유가 없는 버튼을 둘 필요가 없다.
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
      // 목록은 refresh 로 다시 그려지지만 벨은 navbar 에 있어 그대로다 (#259).
      // 실측: 목록이 0 이 됐는데 뱃지는 3 이 남아 있었다.
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
