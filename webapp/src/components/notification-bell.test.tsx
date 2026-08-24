// @vitest-environment jsdom
//
// 알림 종 (#237). 목록은 /notifications 가 그리므로 여기서는 **숫자와 노출 조건**만 본다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

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
});
