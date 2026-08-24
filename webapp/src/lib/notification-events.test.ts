// @vitest-environment jsdom
//
// 읽음 처리를 화면이 바로 따라가게 (#259).
//
// 벨은 navbar 에 있어 글 화면으로 넘어가도 **다시 마운트되지 않는다.** 그래서 알림을 눌러
// 읽음 처리를 해도 숫자가 그대로였다. 실측(스테이징):
//   목록 진입   배지 4 · 안읽음 4
//   클릭 후     배지 4      ← 서버는 이미 3
//   [모두 읽음] 목록 0 인데 배지 3 그대로
//
// 벨과 목록은 서로를 모른다(다른 트리). 상태를 위로 끌어올리려면 navbar~페이지를 감싸는
// provider 가 필요한데, 알림 숫자 하나 때문에 그럴 일이 아니다. 브라우저 이벤트로 알린다.
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

  // 화면 값과 서버 값이 어긋나 있을 수 있다 — 음수 뱃지를 보여 주느니 0 으로 멈춘다.
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

  // 알림을 누르면 곧바로 글 화면으로 넘어간다. 그 순간의 router.refresh() 는 이동에 밀려
  // 먹지 않는다 — 실측에서 뒤로 갔을 때 안읽음이 4건 그대로였다(서버는 3).
  // 그래서 "바뀌었다"만 남겨 두고 목록으로 돌아왔을 때 다시 받아온다.
  describe('목록을 다시 받아와야 하는가', () => {
    it('아무것도 안 했으면 받아올 필요가 없다', () => {
      consumeNotificationsDirty(); // 앞선 테스트의 흔적을 지우고 시작
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
