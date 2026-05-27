// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Navbar from './navbar';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
}));

const pathnameMock = vi.fn<() => string>(() => '/');
vi.mock('next/navigation', () => ({ usePathname: () => pathnameMock() }));

import { useSession } from 'next-auth/react';

describe('Navbar — 퀘스트 드롭다운 (인증)', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/');
    vi.mocked(useSession).mockReturnValue({
      data: { user: { name: '테스터' } },
      status: 'authenticated',
      update: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);
  });

  it('퀘스트 드롭다운 열면 5개 카탈로그 링크 모두 노출', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('퀘스트 메뉴'));
    // "퀘스트" 라벨은 트리거 + 드롭다운 첫 항목 둘 다 — 2개 매칭
    expect(screen.getAllByText('퀘스트').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Villager 카탈로그')).toBeTruthy();
    expect(screen.getByText('Item 카탈로그')).toBeTruthy();
    expect(screen.getByText('Zone 카탈로그')).toBeTruthy();
    expect(screen.getByText('Monster 카탈로그')).toBeTruthy();
  });

  it('퀘스트 드롭다운 항목들의 href 가 /quests, /quests/{villagers,items,zones,monsters}', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('퀘스트 메뉴'));
    // 드롭다운 안의 "퀘스트" 링크 (anchor 태그) — 트리거는 button 이므로 a 만 추림
    const questAnchors = screen.getAllByText('퀘스트')
      .map((el) => el.closest('a'))
      .filter((a): a is HTMLAnchorElement => a !== null);
    expect(questAnchors.length).toBeGreaterThan(0);
    expect(questAnchors[0].getAttribute('href')).toBe('/quests');
    expect(screen.getByText('Villager 카탈로그').closest('a')?.getAttribute('href')).toBe('/quests/villagers');
    expect(screen.getByText('Item 카탈로그').closest('a')?.getAttribute('href')).toBe('/quests/items');
    expect(screen.getByText('Zone 카탈로그').closest('a')?.getAttribute('href')).toBe('/quests/zones');
    expect(screen.getByText('Monster 카탈로그').closest('a')?.getAttribute('href')).toBe('/quests/monsters');
  });

  it('마이페이지 드롭다운엔 개인 메뉴만 — 퀘스트 항목 없음 (중복 노출 금지)', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('마이페이지 메뉴'));
    // 개인 메뉴는 존재
    expect(screen.getByText('내 프로필')).toBeTruthy();
    expect(screen.getByText('내가 올린 유머')).toBeTruthy();
    expect(screen.getByText('설정')).toBeTruthy();
    expect(screen.getByText('유머 업로드')).toBeTruthy();
    // 퀘스트 항목은 마이페이지 드롭다운 안에 없음
    // (퀘스트 드롭다운 트리거 라벨은 "퀘스트"인데 닫혀 있어 항목들은 미노출)
    expect(screen.queryByText('Villager 카탈로그')).toBeNull();
    expect(screen.queryByText('Item 카탈로그')).toBeNull();
    expect(screen.queryByText('Zone 카탈로그')).toBeNull();
    expect(screen.queryByText('Monster 카탈로그')).toBeNull();
  });

  it('퀘스트 트리거는 pathname 이 /quests 일 때 활성 스타일(text-gray-400)', () => {
    pathnameMock.mockReturnValue('/quests');
    render(<Navbar />);
    const trigger = screen.getByLabelText('퀘스트 메뉴');
    expect(trigger.className).toMatch(/text-gray-400/);
  });

  it('퀘스트 트리거는 pathname 이 /quests/villagers 같은 서브 경로일 때도 활성', () => {
    pathnameMock.mockReturnValue('/quests/villagers');
    render(<Navbar />);
    const trigger = screen.getByLabelText('퀘스트 메뉴');
    expect(trigger.className).toMatch(/text-gray-400/);
  });

  it('퀘스트 트리거는 다른 경로일 때 비활성(text-gray-500)', () => {
    pathnameMock.mockReturnValue('/');
    render(<Navbar />);
    const trigger = screen.getByLabelText('퀘스트 메뉴');
    expect(trigger.className).toMatch(/text-gray-500/);
  });

  it('한쪽 드롭다운 열면 다른 쪽 닫힘 — 퀘스트 → 마이페이지', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('퀘스트 메뉴'));
    expect(screen.getByText('Villager 카탈로그')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('마이페이지 메뉴'));
    expect(screen.queryByText('Villager 카탈로그')).toBeNull();
    expect(screen.getByText('내 프로필')).toBeTruthy();
  });

  it('모바일 메뉴 열면 퀘스트 항목들도 렌더', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('모바일 메뉴 열기'));
    expect(screen.getAllByText('퀘스트').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Villager 카탈로그').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Monster 카탈로그').length).toBeGreaterThan(0);
  });
});

describe('Navbar — 비로그인 시 퀘스트 미노출', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/');
    vi.mocked(useSession).mockReturnValue({
      data: null, status: 'unauthenticated', update: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);
  });

  it('퀘스트 메뉴 트리거 자체가 보이지 않음', () => {
    render(<Navbar />);
    expect(screen.queryByLabelText('퀘스트 메뉴')).toBeNull();
    expect(screen.queryByText('Villager 카탈로그')).toBeNull();
  });

  it('마이페이지 메뉴 트리거도 보이지 않음', () => {
    render(<Navbar />);
    expect(screen.queryByLabelText('마이페이지 메뉴')).toBeNull();
  });
});
