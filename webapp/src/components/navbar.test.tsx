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

  it('데스크탑: 게임 → 에테르니아 하위 메뉴에 씬 링크 노출', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('게임 메뉴'));
    fireEvent.click(screen.getByLabelText('에테르니아의 추락 하위 메뉴'));
    const link = screen.getByRole('link', { name: '씬' });
    expect(link.getAttribute('href')).toBe('/scenes');
  });

  // #51 — 하위가 2개 이상(플레이+씬)이면 직행하지 않고 서브메뉴를 유지한다.
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

// #219 — navbar 게임 노출은 web-adventure 만(bevy-rogue 라우트 자체는 라이브 유지).
// #49 — 게임이 여러 개가 될 수 있어 [게임 ▾ → 게임별 ▸ → 항목] 2단 중첩으로 바꿨다.
//   플레이는 공개, 씬은 인증, 피드백 노트·서버 상태는 owner.
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

  // #51 — 하위가 "플레이" 하나뿐이면 펼치는 게 헛클릭이라 바로 이동시킨다.
  it('데스크탑: 게임 이름이 곧 플레이 링크 (서브메뉴 안 열림)', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('게임 메뉴'));

    const link = screen.getByRole('link', { name: /에테르니아의 추락/ });
    expect(link.getAttribute('href')).toBe('/games/web-adventure');
    // 펼침 토글 자체가 없어야 한다.
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
    // 게임 메뉴 자체는 공개라 보인다.
    expect(screen.getByLabelText('게임 메뉴')).toBeTruthy();
  });

  it('마이페이지 메뉴 트리거가 보이지 않음', () => {
    render(<Navbar />);
    expect(screen.queryByLabelText('마이페이지 메뉴')).toBeNull();
  });

  it('모바일: 게임 섹션은 보이되 제작 항목·마이페이지 토글은 미노출', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('모바일 메뉴 열기'));
    // 게임(플레이)은 공개라 섹션이 보인다.
    expect(screen.getByLabelText('모바일 게임 섹션 토글')).toBeTruthy();
    // 옛 최상위 에테르니아 섹션·마이페이지·퀘스트 토글은 없다.
    expect(screen.queryByLabelText('모바일 에테르니아 섹션 토글')).toBeNull();
    expect(screen.queryByLabelText('모바일 마이페이지 섹션 토글')).toBeNull();
    expect(screen.queryByLabelText('모바일 퀘스트 섹션 토글')).toBeNull();

    // 펼쳐도 제작 항목은 없고, 게임 이름이 곧 플레이 링크다(#51).
    fireEvent.click(screen.getByLabelText('모바일 게임 섹션 토글'));
    expect(screen.queryByRole('link', { name: '씬' })).toBeNull();
    expect(screen.getByRole('link', { name: /에테르니아의 추락/ }).getAttribute('href')).toBe('/games/web-adventure');
  });
});

// 자동매매 설정은 owner 전용인데 일반 사용자용 개인 설정 페이지에 얹혀 있었다.
// 주식 메뉴 아래 전용 페이지(/admin/trading)로 분리하고, 마이페이지 설정엔 테마만
// 남긴다. (#45 진입점 추가 → #47 분리)
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
