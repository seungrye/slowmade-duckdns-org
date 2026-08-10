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

// Phase E 이후: quest CMS UI/API 일괄 제거에 따라 navbar 의
// questLinks 드롭다운 + 모바일 collapsible 도 사라졌다. 남은 인증 전용
// CMS 는 web-adventure 의 씬 편집뿐이라 평탄한 단일 링크로 노출.
describe('Navbar — 씬 단일 링크 (인증)', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/');
    vi.mocked(useSession).mockReturnValue({
      data: { user: { name: '테스터' } },
      status: 'authenticated',
      update: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);
  });

  it('데스크탑: 인증 사용자에게 에테르니아 드롭다운 → 씬 링크 노출', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('에테르니아 메뉴'));
    const link = screen.getByRole('link', { name: '씬' });
    expect(link.getAttribute('href')).toBe('/scenes');
  });

  it('데스크탑: 비owner 세션엔 에테르니아 드롭다운에 owner 전용 항목(피드백 노트/서버 상태) 미노출', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('에테르니아 메뉴'));
    expect(screen.queryByRole('link', { name: '피드백 노트' })).toBeNull();
    expect(screen.queryByRole('link', { name: '서버 상태' })).toBeNull();
  });

  it('데스크탑: 마이페이지 드롭다운엔 개인 메뉴만 — 퀘스트 항목 없음', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('마이페이지 메뉴'));
    // 개인 메뉴는 존재
    expect(screen.getByText('내 프로필')).toBeTruthy();
    expect(screen.getByText('내가 올린 유머')).toBeTruthy();
    expect(screen.getByText('설정')).toBeTruthy();
    expect(screen.getByText('유머 업로드')).toBeTruthy();
    // 과거 quest CMS 항목들은 더 이상 존재하지 않음
    expect(screen.queryByText('Villager 카탈로그')).toBeNull();
    expect(screen.queryByText('Item 카탈로그')).toBeNull();
    expect(screen.queryByText('Zone 카탈로그')).toBeNull();
    expect(screen.queryByText('Monster 카탈로그')).toBeNull();
    // 옛 퀘스트 드롭다운 트리거도 사라졌어야 함
    expect(screen.queryByLabelText('퀘스트 메뉴')).toBeNull();
  });

  it('에테르니아 메뉴는 pathname 이 /scenes 일 때 활성 스타일(text-gray-400)', () => {
    pathnameMock.mockReturnValue('/scenes');
    render(<Navbar />);
    const btn = screen.getByLabelText('에테르니아 메뉴');
    expect(btn.className).toMatch(/text-gray-400/);
  });

  it('에테르니아 메뉴는 pathname 이 /scenes/{id} 서브 경로일 때도 활성', () => {
    pathnameMock.mockReturnValue('/scenes/feedback-notes');
    render(<Navbar />);
    const btn = screen.getByLabelText('에테르니아 메뉴');
    expect(btn.className).toMatch(/text-gray-400/);
  });

  it('에테르니아 메뉴는 다른 경로일 때 비활성(text-gray-500)', () => {
    pathnameMock.mockReturnValue('/');
    render(<Navbar />);
    const btn = screen.getByLabelText('에테르니아 메뉴');
    expect(btn.className).toMatch(/text-gray-500/);
  });

  it('모바일 메뉴 열면 씬 링크와 마이페이지 collapsible 헤더가 노출', () => {
    pathnameMock.mockReturnValue('/');
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('모바일 메뉴 열기'));
    expect(screen.getByLabelText('모바일 에테르니아 섹션 토글')).toBeTruthy();
    expect(screen.getByLabelText('모바일 마이페이지 섹션 토글')).toBeTruthy();
    // 옛 퀘스트 모바일 토글은 제거됨
    expect(screen.queryByLabelText('모바일 퀘스트 섹션 토글')).toBeNull();
    // 마이페이지 collapsible 은 활성 라우트 아니라 자식 접힘
    expect(screen.queryByText('내 프로필')).toBeNull();
  });

  it('모바일 마이페이지 헤더 탭하면 자식 4개가 펴짐', () => {
    pathnameMock.mockReturnValue('/');
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('모바일 메뉴 열기'));
    fireEvent.click(screen.getByLabelText('모바일 마이페이지 섹션 토글'));
    expect(screen.getByText('내 프로필')).toBeTruthy();
    expect(screen.getByText('내가 올린 유머')).toBeTruthy();
    expect(screen.getByText('설정')).toBeTruthy();
    expect(screen.getByText('유머 업로드')).toBeTruthy();
  });

  it('pathname 이 /dashboard* 이면 모바일 마이페이지 섹션이 초기부터 펴진 상태', () => {
    pathnameMock.mockReturnValue('/dashboard/profile');
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('모바일 메뉴 열기'));
    expect(screen.getByText('내 프로필')).toBeTruthy();
    expect(screen.getByLabelText('모바일 마이페이지 섹션 토글').getAttribute('aria-expanded')).toBe('true');
  });

  it('pathname 이 /post/write 이면 모바일 마이페이지 섹션이 초기부터 펴진 상태', () => {
    pathnameMock.mockReturnValue('/post/write');
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('모바일 메뉴 열기'));
    expect(screen.getByText('유머 업로드')).toBeTruthy();
    expect(screen.getByLabelText('모바일 마이페이지 섹션 토글').getAttribute('aria-expanded')).toBe('true');
  });
});

// #219 — 게임 메뉴를 bevy-rogue → web-adventure 로 교체.
// bevy-rogue 라우트(/games/bevy-rogue) 자체는 라이브 유지(URL 직접 접근 가능)지만
// navbar 노출은 web-adventure 만.
describe('Navbar — 게임 메뉴 (#219: bevy-rogue → web-adventure 교체)', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/');
    vi.mocked(useSession).mockReturnValue({
      data: null, status: 'unauthenticated', update: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);
  });

  it('데스크탑: 게임 메뉴 링크가 /games/web-adventure 를 가리킨다', () => {
    render(<Navbar />);
    const link = screen.getByRole('link', { name: /게임/ });
    expect(link.getAttribute('href')).toBe('/games/web-adventure');
  });

  it('데스크탑: /games/bevy-rogue 링크가 노출되지 않는다', () => {
    render(<Navbar />);
    const links = screen.getAllByRole('link');
    const bevyLinks = links.filter((l) => l.getAttribute('href') === '/games/bevy-rogue');
    expect(bevyLinks).toHaveLength(0);
  });

  it('모바일: 게임 메뉴 링크가 /games/web-adventure', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('모바일 메뉴 열기'));
    const links = screen.getAllByRole('link');
    const webAdvLinks = links.filter((l) => l.getAttribute('href') === '/games/web-adventure');
    expect(webAdvLinks.length).toBeGreaterThanOrEqual(1);
    const bevyLinks = links.filter((l) => l.getAttribute('href') === '/games/bevy-rogue');
    expect(bevyLinks).toHaveLength(0);
  });
});

describe('Navbar — 비로그인 시 인증 메뉴 미노출', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/');
    vi.mocked(useSession).mockReturnValue({
      data: null, status: 'unauthenticated', update: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);
  });

  it('에테르니아 메뉴가 보이지 않음', () => {
    render(<Navbar />);
    expect(screen.queryByLabelText('에테르니아 메뉴')).toBeNull();
  });

  it('마이페이지 메뉴 트리거가 보이지 않음', () => {
    render(<Navbar />);
    expect(screen.queryByLabelText('마이페이지 메뉴')).toBeNull();
  });

  it('모바일 메뉴 열어도 씬 링크/마이페이지 토글 둘 다 미노출', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('모바일 메뉴 열기'));
    expect(screen.queryByLabelText('모바일 에테르니아 섹션 토글')).toBeNull();
    expect(screen.queryByLabelText('모바일 마이페이지 섹션 토글')).toBeNull();
    // 옛 퀘스트 토글도 미노출
    expect(screen.queryByLabelText('모바일 퀘스트 섹션 토글')).toBeNull();
  });
});

// 자동매매 설정은 /dashboard/settings 안에만 있어, 주식 작업 중 파라미터를 고치려면
// 마이페이지로 나갔다 와야 했다. 주식 드롭다운에 진입점을 둔다. (#45)
describe('Navbar — 주식 메뉴의 자동매매 설정 진입점', () => {
  const mockSession = (isOwner: boolean) =>
    vi.mocked(useSession).mockReturnValue({
      data: { user: { name: '테스터', isOwner } },
      status: 'authenticated',
      update: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);

  beforeEach(() => {
    pathnameMock.mockReturnValue('/');
  });

  it('owner: 주식 드롭다운에 자동매매 설정 링크가 앵커까지 붙어 노출', () => {
    mockSession(true);
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('주식 메뉴'));

    const link = screen.getByRole('link', { name: /자동매매 설정/ });
    expect(link.getAttribute('href')).toBe('/dashboard/settings#trading');
  });

  it('owner: 기존 주식 항목들도 그대로 유지', () => {
    mockSession(true);
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('주식 메뉴'));

    expect(screen.getByRole('link', { name: /종목 차트/ }).getAttribute('href')).toBe('/admin/stocks');
    expect(screen.getByRole('link', { name: /매매 차트/ }).getAttribute('href')).toBe('/admin/portfolio');
    expect(screen.getByRole('link', { name: /백테스트/ }).getAttribute('href')).toBe('/admin/backtest');
  });

  it('비owner: 주식 메뉴 자체가 없으므로 자동매매 설정도 미노출', () => {
    mockSession(false);
    render(<Navbar />);

    expect(screen.queryByLabelText('주식 메뉴')).toBeNull();
    expect(screen.queryByRole('link', { name: /자동매매 설정/ })).toBeNull();
  });

  it('모바일: owner 주식 섹션을 펼치면 자동매매 설정이 보인다', () => {
    mockSession(true);
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('모바일 메뉴 열기'));
    fireEvent.click(screen.getByLabelText('모바일 주식 섹션 토글'));

    const links = screen.getAllByRole('link', { name: /자동매매 설정/ });
    expect(links.some((l) => l.getAttribute('href') === '/dashboard/settings#trading')).toBe(true);
  });
});
