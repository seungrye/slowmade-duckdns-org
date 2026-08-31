// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CalendarBadge, { CALENDAR_CHECKED_KEY } from './calendar-badge';
import type { CalendarEvent } from '@/lib/calendar/types';

const HOLIDAY: CalendarEvent = {
  name: '광복절',
  kind: 'holiday',
  icon: '🎗️',
  description: '1945년 일제로부터 해방된 것을 기리는 날입니다.',
};
const SEASON: CalendarEvent = {
  name: '말복',
  kind: 'season',
  icon: '🗓️',
  description: '',
};

function mockEvents(events: CalendarEvent[]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: { events } }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CalendarBadge', () => {
  it('해당 없는 날이면 아무것도 그리지 않는다', async () => {
    mockEvents([]);
    const { container } = render(<CalendarBadge />);

    await waitFor(() => expect(localStorage.getItem(CALENDAR_CHECKED_KEY)).toBeTruthy());
    expect(container).toBeEmptyDOMElement();
  });

  it('오늘이 특일이면 아이콘을 보여준다', async () => {
    mockEvents([HOLIDAY]);
    render(<CalendarBadge />);

    expect(await screen.findByRole('button')).toHaveTextContent('🎗️');
  });

  it('조회 실패해도 화면이 깨지지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { container } = render(<CalendarBadge />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('하루에 한 번만 조회한다', async () => {
    const fetchMock = mockEvents([HOLIDAY]);
    const { unmount } = render(<CalendarBadge />);
    await screen.findByRole('button');
    unmount();

    render(<CalendarBadge />);
    // 두 번째 마운트는 표식을 보고 조회를 건너뛴다.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  describe('툴팁', () => {
    it('눌러서 연다 — 모바일엔 hover 가 없다', async () => {
      mockEvents([HOLIDAY]);
      render(<CalendarBadge />);
      const button = await screen.findByRole('button');

      expect(screen.queryByRole('tooltip')).toBeNull();
      fireEvent.click(button);
      expect(screen.getByRole('tooltip')).toHaveTextContent('1945년');
    });

    it('마우스를 올려도 열린다', async () => {
      mockEvents([HOLIDAY]);
      render(<CalendarBadge />);
      const button = await screen.findByRole('button');

      fireEvent.mouseEnter(button);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
      fireEvent.mouseLeave(button);
      expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('키보드 포커스로도 열린다', async () => {
      mockEvents([HOLIDAY]);
      render(<CalendarBadge />);
      const button = await screen.findByRole('button');

      fireEvent.focus(button);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });

    it('Esc 로 닫힌다', async () => {
      mockEvents([HOLIDAY]);
      render(<CalendarBadge />);
      const button = await screen.findByRole('button');

      fireEvent.click(button);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('바깥을 누르면 닫힌다', async () => {
      mockEvents([HOLIDAY]);
      render(<CalendarBadge />);
      const button = await screen.findByRole('button');

      fireEvent.click(button);
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('설명이 없는 날은 이름만 보여준다', async () => {
      mockEvents([SEASON]);
      render(<CalendarBadge />);
      fireEvent.click(await screen.findByRole('button'));

      expect(screen.getByRole('tooltip')).toHaveTextContent('말복');
    });

    it('여러 날이 겹치면 전부 나열한다', async () => {
      mockEvents([HOLIDAY, SEASON]);
      render(<CalendarBadge />);
      const button = await screen.findByRole('button');

      expect(button).toHaveTextContent('🎗️');
      expect(button).toHaveTextContent('🗓️');
      fireEvent.click(button);
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveTextContent('광복절');
      expect(tooltip).toHaveTextContent('말복');
    });
  });
});
