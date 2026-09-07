// Making the UI follow a read immediately (#259).
//
// The bell (navbar) and the notification list (a page) are in **different trees** and know nothing of each other.
// The bell is not even remounted when moving between screens, so tapping a notification marked it read while the number stayed.
// Measured (staging):
//
//   opening the list   badge 4, unread 4
//   after a click      badge 4        <- the server already says 3
//   [mark all read]    the list is 0 while the badge still says 3
//
// Lifting the state up would need a provider wrapping everything from the navbar to the page, and one number is not
// worth restructuring the tree for. **A browser event tells them** - neither the sender nor the listener imports
// the other.
//
// It is sent **the moment it is tapped**, without waiting for the server's response. A visible reaction is the point,
// and any disagreement is corrected by the server's value on the next fetch.

/** One notification was read. */
export const NOTIFICATION_READ = 'notification:read';

/** Everything was marked read. */
export const NOTIFICATIONS_ALL_READ = 'notification:all-read';

function emit(name: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name));
}

/**
 * Whether the list needs re-fetching (#259).
 *
 * Tapping a notification navigates to the post immediately, and calling `router.refresh()` at that moment loses to
 * the navigation - measured, **going back still showed 4 unread** (the server said 3).
 * So only the fact that something changed is recorded, and it re-fetches **on returning** to the list.
 *
 * Being a module variable it survives client navigations and disappears on a reload - which is fine, since a reload fetches the latest anyway.
 */
let dirty = false;

export function emitNotificationRead(): void {
  dirty = true;
  emit(NOTIFICATION_READ);
}

/** Returns true when a re-fetch is needed and clears the flag - so it refreshes only once. */
export function consumeNotificationsDirty(): boolean {
  const was = dirty;
  dirty = false;
  return was;
}

export function emitNotificationsAllRead(): void {
  emit(NOTIFICATIONS_ALL_READ);
}

/**
 * The new count after one is read.
 *
 * The UI's value and the server's can disagree - better to stop at 0 than show a negative badge.
 */
export function decrementUnread(count: number): number {
  return Math.max(0, count - 1);
}
