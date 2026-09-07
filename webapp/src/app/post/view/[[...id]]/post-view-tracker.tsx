'use client';

import { useEffect, useRef } from 'react';

/**
 * Increments the view count once when the view page mounts (POST /api/post/view).
 *
 * Moving the view-count write out of the server render and into the client makes the page render pure
 * -> page.tsx can be cached by ISR (revalidate). Only real visits count, and
 * prerender and bot renders are excluded. Failures are swallowed quietly (so the view is not broken by a counter).
 */
export default function PostViewTracker({ id, skip = false }: { id: string; skip?: boolean }) {
  const sent = useRef(false);
  useEffect(() => {
    if (skip || sent.current) return; // Private posts are not counted
    sent.current = true;
    fetch('/api/post/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }, [id, skip]);
  return null;
}
