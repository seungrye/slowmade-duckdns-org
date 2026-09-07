'use client';

// Refetches on returning to the list (#259).
//
// Pressing a notification navigates straight to the post. Calling `router.refresh()` at that moment loses
// to the navigation - measured, **going back showed all 4 unread** (the server already had 3).
//
// So pressing only leaves a "something changed" marker, and the fetch happens here when the list appears again.
// With nothing changed it does nothing - so as not to draw twice on every entry.
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
