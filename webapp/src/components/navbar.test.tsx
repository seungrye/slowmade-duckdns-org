// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Navbar from './navbar';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

import { useSession } from 'next-auth/react';

describe('Navbar — 마이페이지 드롭다운에 퀘스트 링크', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { name: '테스터' } },
      status: 'authenticated',
      update: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);
  });

  it('드롭다운 열면 퀘스트 / Villager / Item / Zone 링크 모두 노출', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('마이페이지 메뉴'));
    expect(screen.getByText('퀘스트')).toBeTruthy();
    expect(screen.getByText('Villager 카탈로그')).toBeTruthy();
    expect(screen.getByText('Item 카탈로그')).toBeTruthy();
    expect(screen.getByText('Zone 카탈로그')).toBeTruthy();
  });

  it('퀘스트 링크의 href 가 /quests', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('마이페이지 메뉴'));
    const link = screen.getByText('퀘스트').closest('a');
    expect(link?.getAttribute('href')).toBe('/quests');
  });

  it('카탈로그 3종 href 가 /quests/{villagers,items,zones}', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('마이페이지 메뉴'));
    expect(screen.getByText('Villager 카탈로그').closest('a')?.getAttribute('href')).toBe('/quests/villagers');
    expect(screen.getByText('Item 카탈로그').closest('a')?.getAttribute('href')).toBe('/quests/items');
    expect(screen.getByText('Zone 카탈로그').closest('a')?.getAttribute('href')).toBe('/quests/zones');
  });

  it('모바일 메뉴 열면 퀘스트 항목들도 렌더', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('모바일 메뉴 열기'));
    // 모바일 메뉴는 로그인 상태에서 myPageLinks 모두 노출
    expect(screen.getAllByText('퀘스트').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Villager 카탈로그').length).toBeGreaterThan(0);
  });
});

describe('Navbar — 비로그인 시 퀘스트 링크 미노출', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      data: null, status: 'unauthenticated', update: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);
  });

  it('퀘스트 메뉴 보이지 않음 (로그인 후에만 마이페이지 노출)', () => {
    render(<Navbar />);
    expect(screen.queryByText('퀘스트')).toBeNull();
    expect(screen.queryByText('Villager 카탈로그')).toBeNull();
  });
});
