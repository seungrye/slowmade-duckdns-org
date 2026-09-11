'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { getFirebaseAnalytics } from '@/lib/firebase';
import { shouldTrackHere } from '@/lib/analytics-gate';
import { logEvent } from 'firebase/analytics';

export default function FirebaseAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    // 운영 호스트에서 사람이 볼 때만 센다 (#469).
    //
    // 예전엔 측정 ID 만 보고 어디서든 쐈다. 그래서 e2e 가 통계를 오염시켰다 —
    // `localhost:3099` 로 직접 붙는데 빌드에는 `.env.local` 의 측정 ID 가 실려 있었고,
    // 한 바퀴가 한 페이지를 32번 열었다. 실제 접근 34건 위에 수백 건이 얹혔다.
    if (!shouldTrackHere()) return;

    getFirebaseAnalytics().then((analytics) => {
      if (!analytics) return;
      logEvent(analytics, 'page_view', {
        page_path: pathname,
        page_title: document.title,
        page_location: window.location.href,
      });
    });
  }, [pathname]);

  return null;
}
