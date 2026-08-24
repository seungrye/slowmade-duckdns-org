'use client';

// 목록으로 돌아왔을 때 다시 받아온다 (#259).
//
// 알림을 누르면 곧바로 글 화면으로 넘어간다. 그 순간 `router.refresh()` 를 불러도 이동에
// 밀려 먹지 않는다 — 실측에서 **뒤로 갔을 때 안읽음이 4건 그대로**였다(서버는 이미 3).
//
// 그래서 누를 때는 "바뀌었다"는 표시만 남기고, 목록이 다시 뜰 때 여기서 받아온다.
// 바뀐 게 없으면 아무것도 하지 않는다 — 들어올 때마다 두 번 그리지 않으려고.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { consumeNotificationsDirty } from '@/lib/notification-events';

export default function RefreshOnReturn() {
  const router = useRouter();
  useEffect(() => {
    if (consumeNotificationsDirty()) router.refresh();
  }, [router]);
  return null;
}
