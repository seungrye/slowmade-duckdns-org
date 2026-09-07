// @vitest-environment jsdom
//
// Making the UI follow a read immediately (#259).
//
// The bell lives in the navbar, so it **is not remounted** when moving to a post. Tapping a notification therefore
// marked it read while the number stayed. Measured (staging):
//   opening the list   badge 4, unread 4
//   after a click      badge 4      <- the server already says 3
//   [mark all read]    the list is 0 while the badge still says 3
//
// The bell and the list know nothing of each other (different trees). Lifting the state up would need a provider
// wrapping the navbar and the page, which is not worth doing for one number. A browser event tells them instead.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  NOTIFICATION_READ,
  NOTIFICATIONS_ALL_READ,
  emitNotificationRead,
  emitNotificationsAllRead,
  decrementUnread,
  consumeNotificationsDirty,
} from './notification-events';

describe('decrementUnread — 하나 읽었을 때의 숫자', () => {
  it('하나 줄인다', () => {
    expect(decrementUnread(3)).toBe(2);
  });

  // The UI's value and the server's can disagree - better to stop at 0 than show a negative badge.
  it('0 아래로 내려가지 않는다', () => {
    expect(decrementUnread(0)).toBe(0);
    expect(decrementUnread(-5)).toBe(0);
  });
});

describe('알림 이벤트', () => {
  afterEach(() => vi.restoreAllMocks());

  it('하나 읽음을 알린다', () => {
    const heard = vi.fn();
    window.addEventListener(NOTIFICATION_READ, heard);
    emitNotificationRead();
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener(NOTIFICATION_READ, heard);
  });

  it('모두 읽음을 알린다', () => {
    const heard = vi.fn();
    window.addEventListener(NOTIFICATIONS_ALL_READ, heard);
    emitNotificationsAllRead();
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener(NOTIFICATIONS_ALL_READ, heard);
  });

  // Tapping a notification navigates to the post immediately. A router.refresh() at that moment loses to the
  // navigation - measured, going back still showed 4 unread (the server said 3).
  // So only "something changed" is recorded, and it re-fetches on returning to the list.
  describe('목록을 다시 받아와야 하는가', () => {
    it('아무것도 안 했으면 받아올 필요가 없다', () => {
      consumeNotificationsDirty(); // start by clearing what earlier tests left behind
      expect(consumeNotificationsDirty()).toBe(false);
    });

    it('하나 읽었으면 받아와야 한다', () => {
      consumeNotificationsDirty();
      emitNotificationRead();
      expect(consumeNotificationsDirty()).toBe(true);
    });

    it('한 번 받아오면 표시가 지워진다 — 볼 때마다 다시 받지 않는다', () => {
      consumeNotificationsDirty();
      emitNotificationRead();
      consumeNotificationsDirty();
      expect(consumeNotificationsDirty()).toBe(false);
    });
  });

  it('둘은 서로 다른 신호다 — 하나 읽음이 전체를 지우면 안 된다', () => {
    const all = vi.fn();
    window.addEventListener(NOTIFICATIONS_ALL_READ, all);
    emitNotificationRead();
    expect(all).not.toHaveBeenCalled();
    window.removeEventListener(NOTIFICATIONS_ALL_READ, all);
  });
});
