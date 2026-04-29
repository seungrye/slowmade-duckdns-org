'use client';

import { useEffect, useRef } from 'react';
import { getFirebaseAnalytics } from '@/lib/firebase';
import { logEvent } from 'firebase/analytics';

const THRESHOLDS = [25, 50, 75, 100];

interface Props {
  postId: string;
  postTitle: string;
}

export default function PostScrollDepth({ postId, postTitle }: Props) {
  const firedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    firedRef.current = new Set();

    function handleScroll() {
      const scrolled = window.scrollY + window.innerHeight;
      const total = document.documentElement.scrollHeight;
      const percent = Math.round((scrolled / total) * 100);

      for (const threshold of THRESHOLDS) {
        if (percent >= threshold && !firedRef.current.has(threshold)) {
          firedRef.current.add(threshold);
          getFirebaseAnalytics().then((analytics) => {
            if (!analytics) return;
            logEvent(analytics, 'scroll_depth', {
              percent_scrolled: threshold,
              post_id: postId,
              post_title: postTitle,
            });
          });
        }
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [postId, postTitle]);

  return null;
}
