// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';
import VillagersPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({}) }));

const mockVillagers = [
  { _id: '1', name: '장로', color: [0.9, 0.8, 0.5], dialogs: [], questId: 'gem_quest', speed: 0.5, version: 1 },
  { _id: '2', name: '촌장', color: [1.0, 0.85, 0.0], dialogs: ['안녕', '잘가'], questId: null, speed: 1.0, version: 3 },
];

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    json: async () => ({ data: mockVillagers }),
    ok: true,
  } as Response);
});

describe('VillagersPage 렌더', () => {
  it('타이틀을 표시한다', async () => {
    render(<VillagersPage />);
    await act(async () => {});
    expect(screen.getByText('Villager 카탈로그')).toBeTruthy();
  });

  it('목록의 villager name 을 모두 렌더한다', async () => {
    render(<VillagersPage />);
    await act(async () => {});
    expect(screen.getByText('장로')).toBeTruthy();
    expect(screen.getByText('촌장')).toBeTruthy();
  });

  it('퀘스트 NPC 와 일반 NPC 의 메타 정보가 다르게 표시된다', async () => {
    const { container } = render(<VillagersPage />);
    await act(async () => {});
    const text = container.textContent ?? '';
    expect(text).toContain('quest: gem_quest');
    expect(text).toContain('일반');
    expect(text).toContain('대사 0줄');
    expect(text).toContain('대사 2줄');
  });

  it('각 행에 히스토리 링크가 렌더된다', async () => {
    render(<VillagersPage />);
    await act(async () => {});
    expect(screen.getByText('히스토리 (v1)')).toBeTruthy();
    expect(screen.getByText('히스토리 (v3)')).toBeTruthy();
  });
});

describe('VillagersPage 신규 폼', () => {
  it('+ 새 villager 클릭 시 폼이 열린다', async () => {
    render(<VillagersPage />);
    await act(async () => {});
    fireEvent.click(screen.getByText('+ 새 villager'));
    expect(screen.getByText('생성')).toBeTruthy();
  });
});

describe('VillagersPage 빈 상태', () => {
  it('등록된 villager 가 없으면 안내 메시지', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({ data: [] }),
      ok: true,
    } as Response);
    render(<VillagersPage />);
    await act(async () => {});
    expect(screen.getByText(/등록된 villager 가 없습니다/)).toBeTruthy();
  });
});
