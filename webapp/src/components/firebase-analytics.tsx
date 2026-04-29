'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { getFirebaseAnalytics } from '@/lib/firebase';
import { logEvent } from 'firebase/analytics';

export default function FirebaseAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID) return;

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
