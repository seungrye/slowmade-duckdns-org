'use client';

// 알림 항목 (#247).
//
// 누르면 **그 항목만** 읽음으로 남기고 덧글로 간다. 예전엔 페이지를 여는 것만으로 전부
// 읽음이 돼서, 표식이 새로고침 한 번에 사라졌다 — 무엇을 아직 안 봤는지 알 수 없었다.
//
// `keepalive` 로 보낸다. 클릭 직후 화면이 넘어가는데, 이게 없으면 브라우저가 이동하면서
// 요청을 끊어 버려 읽음 처리가 조용히 누락된다.
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
    // 서버 응답을 기다리지 않고 **누르는 즉시** 알린다 (#259) — 벨은 navbar 에 있어 화면을
    // 옮겨도 다시 마운트되지 않으므로, 알려 주지 않으면 새로고침 전까지 숫자가 그대로다.
    // 이미 읽은 항목을 다시 눌렀을 때 빼면 안 되니 안 읽은 것만 센다.
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
