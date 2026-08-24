// @vitest-environment jsdom
//
// 알림 종 (#237). 목록은 /notifications 가 그리므로 여기서는 **숫자와 노출 조건**만 본다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { emitNotificationRead, emitNotificationsAllRead } from '@/lib/notification-events';

const mockUseSession = vi.hoisted(() => vi.fn());
vi.mock('next-auth/react', () => ({ useSession: mockUseSession }));

import NotificationBell from './notification-bell';

function mockCount(unreadCount: number) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ data: { unreadCount, items: [] } }),
  })));
}

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: { user: { email: 'me@x.test' } } });
    mockCount(0);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('비로그인이면 아무것도 그리지 않는다', () => {
    mockUseSession.mockReturnValue({ data: null });
    const { container } = render(<NotificationBell />);
    expect(container.firstChild).toBeNull();
  });

  it('안 읽은 게 없으면 숫자를 붙이지 않는다', async () => {
    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByLabelText('알림')).toBeTruthy());
    expect(screen.queryByText('0')).toBeNull();
  });

  it('안 읽은 수를 뱃지로 보여 준다', async () => {
    mockCount(3);
    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByText('3')).toBeTruthy());
    expect(screen.getByLabelText('알림 3건')).toBeTruthy();
  });

  it('100건 이상은 99+ 로 줄인다', async () => {
    mockCount(150);
    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByText('99+')).toBeTruthy());
  });

  // 알림 때문에 화면이 깨지면 안 된다.
  it('조회가 실패해도 종은 그대로 보인다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByLabelText('알림')).toBeTruthy());
  });

  // ── 읽음 처리를 바로 따라간다 (#259) ──────────────────────────────
  //
  // 벨은 navbar 에 있어 글 화면으로 넘어가도 다시 마운트되지 않는다. 그래서 알림을 눌러
  // 읽음 처리를 해도 숫자가 그대로였다 — 새로고침해야 바뀌었다.
  describe('읽음 신호를 따라간다 (#259)', () => {
    it('하나 읽으면 숫자가 하나 준다', async () => {
      mockCount(3);
      render(<NotificationBell />);
      await waitFor(() => expect(screen.getByText('3')).toBeTruthy());
      act(() => emitNotificationRead());
      await waitFor(() => expect(screen.getByText('2')).toBeTruthy());
    });

    it('마지막 하나를 읽으면 뱃지가 사라진다', async () => {
      mockCount(1);
      render(<NotificationBell />);
      await waitFor(() => expect(screen.getByText('1')).toBeTruthy());
      act(() => emitNotificationRead());
      await waitFor(() => expect(screen.queryByText('0')).toBeNull());
      expect(screen.getByLabelText('알림')).toBeTruthy();
    });

    // 화면 값과 서버 값이 어긋나 있어도 음수 뱃지를 보여 주지 않는다.
    it('없는데 더 읽어도 음수가 되지 않는다', async () => {
      mockCount(0);
      render(<NotificationBell />);
      await waitFor(() => expect(screen.getByLabelText('알림')).toBeTruthy());
      act(() => emitNotificationRead());
      expect(screen.queryByText('-1')).toBeNull();
    });

    it('모두 읽으면 뱃지가 사라진다', async () => {
      mockCount(7);
      render(<NotificationBell />);
      await waitFor(() => expect(screen.getByText('7')).toBeTruthy());
      act(() => emitNotificationsAllRead());
      await waitFor(() => expect(screen.queryByText('7')).toBeNull());
      expect(screen.getByLabelText('알림')).toBeTruthy();
    });

    // 화면을 떠난 뒤에도 신호를 붙들고 있으면 안 된다.
    it('사라진 뒤에는 신호를 듣지 않는다', async () => {
      mockCount(2);
      const view = render(<NotificationBell />);
      await waitFor(() => expect(screen.getByText('2')).toBeTruthy());
      view.unmount();
      expect(() => act(() => emitNotificationRead())).not.toThrow();
    });
  });
});
