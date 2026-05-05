// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import QuestsPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({}) }));

const mockQuests = [
  { _id: '1', id: 'quest_a', title: '퀘스트 A', version: 1, updatedAt: new Date().toISOString() },
  { _id: '2', id: 'quest_b', title: '퀘스트 B', version: 2, updatedAt: new Date().toISOString() },
];

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    json: async () => ({ data: [] }),
    ok: true,
  } as Response);
});

describe('QuestsPage 레이아웃', () => {
  it('컨테이너에 max-w-4xl 클래스가 없다', () => {
    const { container } = render(<QuestsPage />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper?.className).not.toContain('max-w-4xl');
  });

  it('컨테이너에 mx-auto 클래스가 있다', () => {
    const { container } = render(<QuestsPage />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper?.className).toContain('mx-auto');
  });
});

describe('QuestsPage 그리드 레이아웃', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({ data: mockQuests }),
      ok: true,
    } as Response);
  });

  it('목록이 grid grid-cols-1 md:grid-cols-2 클래스를 가진다', async () => {
    const { container } = render(<QuestsPage />);
    await act(async () => {});
    const ul = container.querySelector('ul');
    expect(ul?.className).toContain('grid');
    expect(ul?.className).toContain('grid-cols-1');
    expect(ul?.className).toContain('md:grid-cols-2');
  });

  it('각 카드가 flex-col 레이아웃이다', async () => {
    const { container } = render(<QuestsPage />);
    await act(async () => {});
    const cards = container.querySelectorAll('ul > li');
    expect(cards.length).toBe(2);
    cards.forEach((card) => {
      expect(card.className).toContain('flex-col');
    });
  });
});
