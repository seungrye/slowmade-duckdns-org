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

// After Phase E: with the quest CMS UI and API removed wholesale, the navbar's
// questLinks dropdown and its mobile collapsible went too. The only authenticated
// CMS left is web-adventure's scene editing, exposed as a flat single link.
describe('Navbar — 씬 단일 링크 (인증)', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/');
    vi.mocked(useSession).mockReturnValue({
      data: { user: { name: '테스터' } },
      status: 'authenticated',
      update: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);
  });

  it('데스크탑: 게임 → 에테르니아 하위 메뉴에 씬 링크 노출', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('게임 메뉴'));
    fireEvent.click(screen.getByLabelText('에테르니아의 추락 하위 메뉴'));
    const link = screen.getByRole('link', { name: '씬' });
    expect(link.getAttribute('href')).toBe('/scenes');
  });

  // #51 - with 2 or more children (play plus scenes) it keeps the submenu rather than going straight there.
  it('데스크탑: 로그인 사용자는 게임 이름이 링크가 아니라 펼침 토글', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('게임 메뉴'));

    expect(screen.getByLabelText('에테르니아의 추락 하위 메뉴')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /에테르니아의 추락/ })).toBeNull();
  });

  it('데스크탑: 비owner 세션엔 owner 전용 항목(피드백 노트/서버 상태) 미노출', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('게임 메뉴'));
    fireEvent.click(screen.getByLabelText('에테르니아의 추락 하위 메뉴'));
    expect(screen.queryByRole('link', { name: '피드백 노트' })).toBeNull();
    expect(screen.queryByRole('link', { name: '서버 상태' })).toBeNull();
  });

  it('데스크탑: 마이페이지 드롭다운엔 개인 메뉴만 — 퀘스트 항목 없음', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('마이페이지 메뉴'));
    // the personal menu exists
    expect(screen.getByText('내 프로필')).toBeTruthy();
    expect(screen.getByText('내가 올린 유머')).toBeTruthy();
    expect(screen.getByText('설정')).toBeTruthy();
    expect(screen.getByText('유머 업로드')).toBeTruthy();
    // the old quest CMS entries no longer exist
    expect(screen.queryByText('Villager 카탈로그')).toBeNull();
    expect(screen.queryByText('Item 카탈로그')).toBeNull();
    expect(screen.queryByText('Zone 카탈로그')).toBeNull();
    expect(screen.queryByText('Monster 카탈로그')).toBeNull();
    // the old quest dropdown trigger must be gone too
    expect(screen.queryByLabelText('퀘스트 메뉴')).toBeNull();
  });

  it('게임 메뉴는 pathname 이 /scenes 일 때 활성 스타일(text-gray-400)', () => {
    pathnameMock.mockReturnValue('/scenes');
    render(<Navbar />);
    const btn = screen.getByLabelText('게임 메뉴');
    expect(btn.className).toMatch(/text-gray-400/);
  });

  it('게임 메뉴는 pathname 이 /scenes/{id} 서브 경로일 때도 활성', () => {
    pathnameMock.mockReturnValue('/scenes/feedback-notes');
    render(<Navbar />);
    const btn = screen.getByLabelText('게임 메뉴');
    expect(btn.className).toMatch(/text-gray-400/);
  });

  it('게임 메뉴는 플레이 경로(/games/*)에서도 활성', () => {
    pathnameMock.mockReturnValue('/games/web-adventure');
    render(<Navbar />);
    const btn = screen.getByLabelText('게임 메뉴');
    expect(btn.className).toMatch(/text-gray-400/);
  });

  it('게임 메뉴는 다른 경로일 때 비활성(text-gray-500)', () => {
    pathnameMock.mockReturnValue('/');
    render(<Navbar />);
    const btn = screen.getByLabelText('게임 메뉴');
    expect(btn.className).toMatch(/text-gray-500/);
  });

  it('모바일 메뉴 열면 게임 섹션과 마이페이지 collapsible 헤더가 노출', () => {
    pathnameMock.mockReturnValue('/');
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('모바일 메뉴 열기'));
    expect(screen.getByLabelText('모바일 게임 섹션 토글')).toBeTruthy();
    expect(screen.getByLabelText('모바일 마이페이지 섹션 토글')).toBeTruthy();
    // the old quest mobile toggle is removed
    expect(screen.queryByLabelText('모바일 퀘스트 섹션 토글')).toBeNull();
    // the my-page collapsible is not the active route, so its children are collapsed
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

// #219 - the navbar exposes web-adventure alone (the bevy-rogue route itself stays live).
// #49 - there can be several games, so it became a two-level nesting [Games -> per game -> the item].
//   Play is public, the scenes need a login, and the feedback notes and server status are owner-only.
describe('Navbar — 게임 2단 메뉴 (비로그인)', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/');
    vi.mocked(useSession).mockReturnValue({
      data: null, status: 'unauthenticated', update: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);
  });

  it('데스크탑: 비로그인도 게임 메뉴가 보인다 (플레이는 공개)', () => {
    render(<Navbar />);
    expect(screen.getByLabelText('게임 메뉴')).toBeTruthy();
  });

  // #51 - with "play" as the only child, expanding is a wasted click, so it navigates straight there.
  it('데스크탑: 게임 이름이 곧 플레이 링크 (서브메뉴 안 열림)', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('게임 메뉴'));

    const link = screen.getByRole('link', { name: /에테르니아의 추락/ });
    expect(link.getAttribute('href')).toBe('/games/web-adventure');
    // The expand toggle itself must be absent.
    expect(screen.queryByLabelText('에테르니아의 추락 하위 메뉴')).toBeNull();
  });

  it('데스크탑: 비로그인에겐 제작 항목이 어디에도 없다', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('게임 메뉴'));
    expect(screen.queryByRole('link', { name: '씬' })).toBeNull();
    expect(screen.queryByRole('link', { name: '피드백 노트' })).toBeNull();
    expect(screen.queryByRole('link', { name: '서버 상태' })).toBeNull();
  });

  it('데스크탑: /games/bevy-rogue 링크가 노출되지 않는다', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('게임 메뉴'));
    const bevy = screen.getAllByRole('link').filter((l) => l.getAttribute('href') === '/games/bevy-rogue');
    expect(bevy).toHaveLength(0);
  });

  it('모바일: 게임 섹션을 펼치면 게임 이름이 곧 플레이 링크', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('모바일 메뉴 열기'));
    fireEvent.click(screen.getByLabelText('모바일 게임 섹션 토글'));

    expect(screen.queryByLabelText('모바일 에테르니아의 추락 토글')).toBeNull();
    const links = screen.getAllByRole('link');
    expect(links.filter((l) => l.getAttribute('href') === '/games/web-adventure').length).toBeGreaterThanOrEqual(1);
    expect(links.filter((l) => l.getAttribute('href') === '/games/bevy-rogue')).toHaveLength(0);
  });
});

describe('Navbar — 비로그인 시 인증 메뉴 미노출', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/');
    vi.mocked(useSession).mockReturnValue({
      data: null, status: 'unauthenticated', update: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);
  });

  it('최상위 에테르니아 메뉴는 없다 (게임 아래로 편입됨)', () => {
    render(<Navbar />);
    expect(screen.queryByLabelText('에테르니아 메뉴')).toBeNull();
    // The game menu itself is public and visible.
    expect(screen.getByLabelText('게임 메뉴')).toBeTruthy();
  });

  it('마이페이지 메뉴 트리거가 보이지 않음', () => {
    render(<Navbar />);
    expect(screen.queryByLabelText('마이페이지 메뉴')).toBeNull();
  });

  it('모바일: 게임 섹션은 보이되 제작 항목·마이페이지 토글은 미노출', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('모바일 메뉴 열기'));
    // The game (play) is public, so the section is visible.
    expect(screen.getByLabelText('모바일 게임 섹션 토글')).toBeTruthy();
    // The old top-level Eternia section, my page and the quest toggle are gone.
    expect(screen.queryByLabelText('모바일 에테르니아 섹션 토글')).toBeNull();
    expect(screen.queryByLabelText('모바일 마이페이지 섹션 토글')).toBeNull();
    expect(screen.queryByLabelText('모바일 퀘스트 섹션 토글')).toBeNull();

    // Expanded, there are no authoring entries and the game's name is the play link itself (#51).
    fireEvent.click(screen.getByLabelText('모바일 게임 섹션 토글'));
    expect(screen.queryByRole('link', { name: '씬' })).toBeNull();
    expect(screen.getByRole('link', { name: /에테르니아의 추락/ }).getAttribute('href')).toBe('/games/web-adventure');
  });
});

// The trading settings are owner-only yet sat on the ordinary user's personal settings page.
// They move to a dedicated page under the stocks menu (/admin/trading), and my page's settings keep
// the theme alone. (#45 added the entry point -> #47 split it out)
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
    expect(link.getAttribute('href')).toBe('/admin/trading');
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
    expect(links.some((l) => l.getAttribute('href') === '/admin/trading')).toBe(true);
  });
});
