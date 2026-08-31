// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MyAchievements from './my-achievements.section';
import type { Session } from 'next-auth';

const session = { user: { email: 'me@test.com' }, expires: '' } as Session;

const UNLOCKED = [
  {
    key: 'FIRST_POST',
    name: '첫 글 작성',
    description: '처음으로 글을 써서 이야기를 시작했습니다.',
    icon: 'FaPencilAlt',
    points: 10,
    tier: 'bronze' as const,
    unlockedAt: '2026-01-01T00:00:00.000Z',
  },
];

const LOCKED = [
  {
    key: 'POST_COUNT_250',
    name: '쌓여 가는 서재',
    description: '글을 250개 썼습니다.',
    icon: 'FaAward',
    points: 250,
    tier: 'silver' as const,
    current: 174,
    target: 250,
    hidden: false,
  },
  {
    key: 'NIGHT_OWL',
    name: '???',
    description: '',
    icon: 'FaMoon',
    points: 40,
    tier: 'bronze' as const,
    current: 0,
    target: 1,
    hidden: true,
  },
  {
    key: 'POST_COUNT_1000',
    name: '천 편의 세월',
    description: '글을 1,000개 썼습니다.',
    icon: 'FaTrophy',
    points: 1000,
    tier: 'gold' as const,
    current: 174,
    target: 1000,
    hidden: false,
  },
];

function mockView(unlocked = UNLOCKED, locked = LOCKED) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { unlocked, locked } }),
    }),
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('MyAchievements', () => {
  it('로그인하지 않으면 아무것도 안 부른다', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<MyAchievements session={null} />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('달성한 업적을 보여준다', async () => {
    mockView();
    render(<MyAchievements session={session} />);

    expect(await screen.findByText('첫 글 작성')).toBeInTheDocument();
    expect(screen.getByText(/처음으로 글을 써서/)).toBeInTheDocument();
  });

  describe('도전 중 — 예전엔 아예 안 보였다', () => {
    it('잠긴 업적도 보여준다', async () => {
      mockView();
      render(<MyAchievements session={session} />);

      expect(await screen.findByText('쌓여 가는 서재')).toBeInTheDocument();
    });

    it('진행도를 숫자와 막대로 보여준다', async () => {
      mockView();
      render(<MyAchievements session={session} />);

      expect(await screen.findByText('174 / 250')).toBeInTheDocument();
      const bar = screen.getByRole('progressbar', { name: /쌓여 가는 서재/ });
      expect(bar).toHaveAttribute('aria-valuenow', '174');
      expect(bar).toHaveAttribute('aria-valuemax', '250');
    });

    it('숨김 업적은 ??? 로만 보인다', async () => {
      mockView();
      render(<MyAchievements session={session} />);

      expect(await screen.findByText('???')).toBeInTheDocument();
      // 진행도까지 보여주면 조건이 새어 나간다.
      expect(screen.queryByText('0 / 1')).toBeNull();
    });
  });

  it('등급마다 색이 다르다 — 금이 제일 눈에 띈다', async () => {
    mockView();
    render(<MyAchievements session={session} />);

    const gold = (await screen.findByText('천 편의 세월')).closest('li')?.querySelector('[data-tier]');
    const silver = screen.getByText('쌓여 가는 서재').closest('li')?.querySelector('[data-tier]');

    expect(gold?.getAttribute('data-tier')).toBe('gold');
    expect(silver?.getAttribute('data-tier')).toBe('silver');
    // 등급 표시는 아이콘 테두리 색이다 — 카드 자체는 같은 모양을 유지한다.
    expect(gold?.className).not.toBe(silver?.className);
  });

  it('개수를 함께 보여준다', async () => {
    mockView();
    render(<MyAchievements session={session} />);

    expect(await screen.findByText(/달성한 업적 \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/도전 중 \(3\)/)).toBeInTheDocument();
  });

  it('조회가 실패해도 화면이 깨지지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<MyAchievements session={session} />);

    await waitFor(() => expect(screen.queryByText(/불러오는 중/)).toBeNull());
    expect(screen.getByText(/업적을 불러오지 못했습니다/)).toBeInTheDocument();
  });

  it('아직 아무것도 못 얻었어도 도전 목록은 보여준다', async () => {
    mockView([], LOCKED);
    render(<MyAchievements session={session} />);

    expect(await screen.findByText(/아직 달성한 업적이 없습니다/)).toBeInTheDocument();
    expect(screen.getByText('쌓여 가는 서재')).toBeInTheDocument();
  });
});
