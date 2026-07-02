'use client';

import { useEffect, useRef } from 'react';

/**
 * 뷰 페이지 마운트 시 조회수를 1회 증가시킨다(POST /api/post/view).
 *
 * 조회수 write 를 server 렌더에서 client 로 옮겨 page 렌더를 순수하게 만든다
 * → page.tsx 가 ISR(revalidate)로 캐싱 가능. 실제 방문만 카운트되고,
 * 프리렌더/봇 렌더는 제외된다. 실패는 조용히 삼킨다(조회수 때문에 뷰가 깨지지 않게).
 */
export default function PostViewTracker({ id }: { id: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    fetch('/api/post/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }, [id]);
  return null;
}
