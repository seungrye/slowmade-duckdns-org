// @vitest-environment jsdom
//
// The main screen's 'latest humour' title search toggle (#232).
//
// The list itself is drawn by InfinitPostList and searched by the server. This checks **the toggle and the debounce** only -
// that it opens from both the title and the magnifier, closes on Escape, and passes the input down as the search term.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { forwardRef } from 'react';

// The list only has to confirm it received the search term.
vi.mock('@/app/infinite-post.section', () => ({
  default: forwardRef(function MockList(
    { query = '' }: { query?: string },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _ref: any,
  ) {
    return <div data-testid="list" data-query={query} />;
  }),
}));
vi.mock('@/app/floating-menu.section', () => ({ default: () => null }));

import ContentSection from './content.section';

const listQuery = () => screen.getByTestId('list').getAttribute('data-query');

describe('ContentSection — 제목 검색 토글', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('처음에는 제목이 보이고 입력창은 없다', () => {
    render(<ContentSection />);
    expect(screen.getByText('🔥 최신 유머')).toBeTruthy();
    expect(screen.queryByLabelText('제목으로 검색')).toBeNull();
  });

  it('제목을 누르면 검색창이 열린다', () => {
    render(<ContentSection />);
    fireEvent.click(screen.getByText('🔥 최신 유머'));
    expect(screen.getByLabelText('제목으로 검색')).toBeTruthy();
  });

  it('돋보기를 눌러도 열린다', () => {
    render(<ContentSection />);
    fireEvent.click(screen.getByLabelText('검색 열기'));
    expect(screen.getByLabelText('제목으로 검색')).toBeTruthy();
  });

  it('Escape 로 닫히고 제목이 돌아온다', () => {
    render(<ContentSection />);
    fireEvent.click(screen.getByLabelText('검색 열기'));
    fireEvent.keyDown(screen.getByLabelText('제목으로 검색'), { key: 'Escape' });
    expect(screen.queryByLabelText('제목으로 검색')).toBeNull();
    expect(screen.getByText('🔥 최신 유머')).toBeTruthy();
  });

  it('입력하면 디바운스 뒤에 검색어가 목록으로 내려간다', () => {
    render(<ContentSection />);
    fireEvent.click(screen.getByLabelText('검색 열기'));
    fireEvent.change(screen.getByLabelText('제목으로 검색'), { target: { value: '고양이' } });

    // Before 250ms have passed nothing is sent - the server is not hit on every keystroke.
    expect(listQuery()).toBe('');

    act(() => { vi.advanceTimersByTime(250); });
    expect(listQuery()).toBe('고양이');
  });

  // A filtered list left behind after closing reads as a bug.
  it('닫으면 검색어도 비워진다', () => {
    render(<ContentSection />);
    fireEvent.click(screen.getByLabelText('검색 열기'));
    fireEvent.change(screen.getByLabelText('제목으로 검색'), { target: { value: '고양이' } });
    act(() => { vi.advanceTimersByTime(250); });
    expect(listQuery()).toBe('고양이');

    fireEvent.click(screen.getByLabelText('검색 닫기'));
    act(() => { vi.advanceTimersByTime(250); });
    expect(listQuery()).toBe('');
  });
});
