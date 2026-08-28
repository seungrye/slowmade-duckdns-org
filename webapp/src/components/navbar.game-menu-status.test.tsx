// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import Navbar from './navbar';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
}));

const pathnameMock = vi.fn<() => string>(() => '/');
vi.mock('next/navigation', () => ({ usePathname: () => pathnameMock() }));

import { useSession } from 'next-auth/react';

// "서버 상태" 를 에테르니아의 추락 하위에서 떼어 게임 메뉴 바로 아래 평탄한 항목으로
// 올린다. 하위가 하나뿐인 묶음은 게임 이름 자체가 링크가 되는 `only` 패턴(#51)이
// 이미 있으므로, gameLinks 데이터만 바꾸면 펼침 토글 없이 평탄한 링크로 그려진다.
// owner 전용은 그대로 — visibleChildren 이 ownerOnly 를 거르고, 남은 항목이 0이면
// visibleGames 가 묶음을 통째로 뺀다.

/** owner 세션 위장 — 서버 상태는 ownerOnly 라 owner 로만 보인다. */
const mockOwnerSession = () =>
  vi.mocked(useSession).mockReturnValue({
    data: { user: { name: '테스터', isOwner: true } },
    status: 'authenticated',
    update: vi.fn(),
  } as unknown as ReturnType<typeof useSession>);

/** `<li>` 로 감싸인 게임 묶음 하나. 최상위 항목과 섞이지 않게 범위를 좁힌다. */
const groupOf = (toggle: HTMLElement): HTMLElement => {
  const li = toggle.closest('li');
  if (!li) throw new Error('토글을 감싸는 <li> 가 없다');
  return li as HTMLElement;
};

/** 게임 목록 `<ul>` 의 직속 항목들 — 링크면 href, 펼침 토글이면 aria-label. */
const outlineOf = (toggle: HTMLElement): (string | null)[] => {
  const list = toggle.closest('ul');
  if (!list) throw new Error('게임 목록 <ul> 이 없다');
  return Array.from(list.children).map((li) => {
    const first = li.firstElementChild;
    if (!first) throw new Error('빈 항목');
    return first.tagName === 'A' ? first.getAttribute('href') : first.getAttribute('aria-label');
  });
};

const hrefsOf = (links: HTMLElement[]) => links.map((l) => l.getAttribute('href'));

describe('Navbar — 서버 상태를 게임 메뉴 바로 아래로 (데스크톱)', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/');
    mockOwnerSession();
  });

  it('게임 메뉴만 열면 서버 상태 링크가 바로 나온다 (에테르니아를 안 거친다)', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('게임 메뉴'));

    const link = screen.getByRole('link', { name: '서버 상태' });
    expect(link.getAttribute('href')).toBe('/scenes/status');
  });

  it('에테르니아 묶음 안에는 서버 상태가 없다', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('게임 메뉴'));
    const toggle = screen.getByLabelText('에테르니아의 추락 하위 메뉴');
    fireEvent.click(toggle);

    expect(within(groupOf(toggle)).queryByRole('link', { name: '서버 상태' })).toBeNull();
  });

  it('에테르니아 하위는 셋 — 플레이·씬·피드백 노트', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('게임 메뉴'));
    const toggle = screen.getByLabelText('에테르니아의 추락 하위 메뉴');
    fireEvent.click(toggle);

    const links = within(groupOf(toggle)).getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(hrefsOf(links)).toEqual(['/games/web-adventure', '/scenes', '/scenes/feedback-notes']);
  });

  it('게임 드롭다운 직속은 [에테르니아 토글, 고전 게임 링크, 서버 상태 링크] — 새 묶음은 토글이 아니다', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('게임 메뉴'));

    expect(outlineOf(screen.getByLabelText('에테르니아의 추락 하위 메뉴'))).toEqual([
      '에테르니아의 추락 하위 메뉴',
      '/games/retro',
      '/scenes/status',
    ]);
    // 하위가 하나뿐인 묶음은 펼침 토글을 만들지 않는다.
    expect(screen.queryByLabelText('서버 상태 하위 메뉴')).toBeNull();
  });

  it('pathname 이 /scenes/status 여도 링크가 사라지지 않고 활성 스타일만 붙는다', () => {
    pathnameMock.mockReturnValue('/scenes/status');
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('게임 메뉴'));

    const link = screen.getByRole('link', { name: '서버 상태' });
    expect(link.getAttribute('href')).toBe('/scenes/status');
    expect(link.className).toMatch(/text-gray-400/);
  });
});

describe('Navbar — 서버 상태를 게임 메뉴 바로 아래로 (모바일)', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/');
    mockOwnerSession();
  });

  it('게임 섹션만 펼치면 서버 상태 링크가 바로 나온다', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('모바일 메뉴 열기'));
    fireEvent.click(screen.getByLabelText('모바일 게임 섹션 토글'));

    // 데스크톱 마크업도 같은 화면에 그려질 수 있어 href 로 걸러 센다.
    const links = screen.getAllByRole('link').filter((l) => l.getAttribute('href') === '/scenes/status');
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toContain('서버 상태');
  });

  it('에테르니아 묶음 안에는 서버 상태가 없다', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('모바일 메뉴 열기'));
    fireEvent.click(screen.getByLabelText('모바일 게임 섹션 토글'));
    const toggle = screen.getByLabelText('모바일 에테르니아의 추락 토글');
    fireEvent.click(toggle);

    const group = groupOf(toggle);
    expect(within(group).queryByRole('link', { name: '서버 상태' })).toBeNull();
    expect(hrefsOf(within(group).getAllByRole('link'))).toEqual([
      '/games/web-adventure',
      '/scenes',
      '/scenes/feedback-notes',
    ]);
  });

  it('게임 섹션 직속은 [에테르니아 토글, 고전 게임 링크, 서버 상태 링크]', () => {
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('모바일 메뉴 열기'));
    fireEvent.click(screen.getByLabelText('모바일 게임 섹션 토글'));

    expect(outlineOf(screen.getByLabelText('모바일 에테르니아의 추락 토글'))).toEqual([
      '모바일 에테르니아의 추락 토글',
      '/games/retro',
      '/scenes/status',
    ]);
    expect(screen.queryByLabelText('모바일 서버 상태 토글')).toBeNull();
  });

  // 새 묶음이 gameLinks 맨 끝이어야 하는 이유 — mobileOpenGameKey 초기값이
  // gameLinks[0]?.key 라, 앞에 끼우면 기본 펼침 대상이 서버 상태로 바뀐다.
  it('/scenes/status 에서도 기본 펼침은 여전히 에테르니아이고, 서버 상태는 그 밖에 있다', () => {
    pathnameMock.mockReturnValue('/scenes/status');
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText('모바일 메뉴 열기'));

    const toggle = screen.getByLabelText('모바일 에테르니아의 추락 토글');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(within(groupOf(toggle)).queryByRole('link', { name: '서버 상태' })).toBeNull();

    const links = screen.getAllByRole('link').filter((l) => l.getAttribute('href') === '/scenes/status');
    expect(links).toHaveLength(1);
  });
});
