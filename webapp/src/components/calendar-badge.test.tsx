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
  name: '백로',
  kind: 'season',
  icon: '💦',
  description: '이슬이 맺히기 시작하는 절기입니다.',
};
const ANNIV: CalendarEvent = {
  name: '푸른하늘의날',
  kind: 'anniversary',
  icon: '🌏',
  description: '맑은 하늘의 소중함을 되새기는 날입니다.',
};
const EXTRA: CalendarEvent = {
  name: '식목일',
  kind: 'anniversary',
  icon: '🌳',
  description: '나무를 심고 가꾸는 날입니다.',
};

function mockEvents(events: CalendarEvent[]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: { events } }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const icons = () => screen.getAllByRole('button');

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

  it('조회 실패해도 화면이 깨지지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { container } = render(<CalendarBadge />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('하루에 한 번만 조회한다', async () => {
    const fetchMock = mockEvents([HOLIDAY]);
    const { unmount } = render(<CalendarBadge />);
    await screen.findByLabelText('광복절');
    unmount();

    render(<CalendarBadge />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  describe('스택', () => {
    it('겹칠 이벤트마다 칸을 하나씩 그린다', async () => {
      mockEvents([HOLIDAY, SEASON]);
      render(<CalendarBadge />);

      await screen.findByLabelText('광복절');
      expect(screen.getByLabelText('백로')).toBeInTheDocument();
      expect(icons()).toHaveLength(2);
    });

    it('세 개를 넘으면 마지막 칸이 +N 이 된다', async () => {
      mockEvents([HOLIDAY, ANNIV, SEASON, EXTRA]);
      render(<CalendarBadge />);

      await screen.findByLabelText('광복절');
      // 앞의 3개 + 넘침 칸
      expect(icons()).toHaveLength(4);
      expect(screen.getByLabelText('외 1건 더 보기')).toHaveTextContent('+1');
      // 4번째 이벤트는 칸으로는 안 그린다.
      expect(screen.queryByLabelText('식목일')).toBeNull();
    });

    it('앞선 칸이 위로 쌓인다 — 가장 중요한 날이 맨 앞', async () => {
      mockEvents([HOLIDAY, SEASON]);
      render(<CalendarBadge />);
      const first = await screen.findByLabelText('광복절');
      const second = screen.getByLabelText('백로');

      expect(Number(first.style.zIndex)).toBeGreaterThan(Number(second.style.zIndex));
    });
  });

  describe('데스크톱 — 짚은 것만', () => {
    it('마우스를 올리면 그 날만 설명한다', async () => {
      mockEvents([HOLIDAY, SEASON]);
      render(<CalendarBadge />);
      const season = await screen.findByLabelText('백로');

      fireEvent.mouseEnter(season);
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveTextContent('이슬이 맺히기');
      expect(tooltip).not.toHaveTextContent('1945년');
    });

    it('짚은 칸이 맨 앞으로 나온다', async () => {
      mockEvents([HOLIDAY, SEASON]);
      render(<CalendarBadge />);
      const season = await screen.findByLabelText('백로');
      const before = Number(season.style.zIndex);

      fireEvent.mouseEnter(season);
      expect(Number(season.style.zIndex)).toBeGreaterThan(before);
      expect(season.className).toContain('ring-white');
    });

    it('벗어나면 닫힌다', async () => {
      mockEvents([HOLIDAY, SEASON]);
      const { container } = render(<CalendarBadge />);
      const holiday = await screen.findByLabelText('광복절');

      fireEvent.mouseEnter(holiday);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
      fireEvent.mouseLeave(container.firstChild as Element);
      expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('키보드 포커스도 hover 처럼 동작한다', async () => {
      mockEvents([HOLIDAY, SEASON]);
      render(<CalendarBadge />);
      const season = await screen.findByLabelText('백로');

      fireEvent.focus(season);
      expect(screen.getByRole('tooltip')).toHaveTextContent('이슬이 맺히기');
      fireEvent.blur(season);
      expect(screen.queryByRole('tooltip')).toBeNull();
    });
  });

  describe('모바일 — 누르면 전부', () => {
    it('누르면 그날 것을 전부 보여준다', async () => {
      mockEvents([HOLIDAY, SEASON]);
      render(<CalendarBadge />);
      const holiday = await screen.findByLabelText('광복절');

      fireEvent.click(holiday);
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveTextContent('광복절');
      expect(tooltip).toHaveTextContent('백로');
    });

    it('+N 을 눌러도 전부 보여준다 — 잘린 것도 여기서 읽는다', async () => {
      mockEvents([HOLIDAY, ANNIV, SEASON, EXTRA]);
      render(<CalendarBadge />);
      const more = await screen.findByLabelText('외 1건 더 보기');

      fireEvent.click(more);
      expect(screen.getByRole('tooltip')).toHaveTextContent('식목일');
    });

    it('다시 누르면 닫힌다', async () => {
      mockEvents([HOLIDAY]);
      render(<CalendarBadge />);
      const holiday = await screen.findByLabelText('광복절');

      fireEvent.click(holiday);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
      fireEvent.click(holiday);
      expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('Esc 로 닫힌다', async () => {
      mockEvents([HOLIDAY]);
      render(<CalendarBadge />);
      fireEvent.click(await screen.findByLabelText('광복절'));

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('바깥을 누르면 닫힌다', async () => {
      mockEvents([HOLIDAY]);
      render(<CalendarBadge />);
      fireEvent.click(await screen.findByLabelText('광복절'));

      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole('tooltip')).toBeNull();
    });
  });
});
