'use client';

// 알림을 봤다고 표시한다 (#237).
//
// **페이지가 그려진 뒤에** 보낸다. 서버에서 미리 갱신해 버리면 "안 읽음" 표시가 이미 풀린
// 상태로 그려져서, 무엇이 새 것이었는지 알 수 없다.
import { useEffect } from 'react';

export default function MarkSeen() {
  useEffect(() => {
    fetch('/api/notifications/seen', { method: 'POST' }).catch(() => {
      // 실패해도 목록은 이미 보인다. 다음에 다시 표시된다.
    });
  }, []);
  return null;
}
