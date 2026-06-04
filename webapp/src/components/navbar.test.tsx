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

  it('데스크탑: 인증 사용자에게 씬 (web-adventure) 단일 링크 노출', () => {
    render(<Navbar />);
    const link = screen.getByLabelText('씬 메뉴');
    expect(link.getAttribute('href')).toBe('/scenes');
    expect(link.textContent).toContain('씬 (web-adventure)');
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

  it('씬 링크는 pathname 이 /scenes 일 때 활성 스타일(text-gray-400)', () => {
    pathnameMock.mockReturnValue('/scenes');
    render(<Navbar />);
    const link = screen.getByLabelText('씬 메뉴');
    expect(link.className).toMatch(/text-gray-400/);
  });

  it('씬 링크는 pathname 이 /scenes/{id} 서브 경로일 때도 활성', () => {
    pathnameMock.mockReturnValue('/scenes/intro');
    render(<Navbar />);
    const link = screen.getByLabelText('씬 메뉴');
    expect(link.className).toMatch(/text-gray-400/);
  });

  it('씬 링크는 다른 경로일 때 비활성(text-gray-500)', () => {
    pathnameMock.mockReturnValue('/');
    render(<Navbar />);
    const link = screen.getByLabelText('씬 메뉴');
    expect(link.className).toMatch(/text-gray-500/);
  });

  it('모바일 메뉴 열면 씬 링크와 마이페이지 collapsible 헤더가 노출', () => {
    pathnameMock.mockReturnValue('/');
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('모바일 메뉴 열기'));
    expect(screen.getByLabelText('모바일 씬 링크')).toBeTruthy();
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

describe('Navbar — 비로그인 시 인증 메뉴 미노출', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/');
    vi.mocked(useSession).mockReturnValue({
      data: null, status: 'unauthenticated', update: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);
  });

  it('씬 링크가 보이지 않음', () => {
    render(<Navbar />);
    expect(screen.queryByLabelText('씬 메뉴')).toBeNull();
  });

  it('마이페이지 메뉴 트리거가 보이지 않음', () => {
    render(<Navbar />);
    expect(screen.queryByLabelText('마이페이지 메뉴')).toBeNull();
  });

  it('모바일 메뉴 열어도 씬 링크/마이페이지 토글 둘 다 미노출', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('모바일 메뉴 열기'));
    expect(screen.queryByLabelText('모바일 씬 링크')).toBeNull();
    expect(screen.queryByLabelText('모바일 마이페이지 섹션 토글')).toBeNull();
    // 옛 퀘스트 토글도 미노출
    expect(screen.queryByLabelText('모바일 퀘스트 섹션 토글')).toBeNull();
  });
});
