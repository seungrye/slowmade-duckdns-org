// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';
import ItemsPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({}) }));

const mockItems = [
  { _id: '1', id: 'eternal_gem', kind: 'quest', displayName: '영원의 보석',
    glyphAscii: '*', glyphUnicode: '◆', glyphGameIcon: '◆',
    pickupMessage: '획득', imagePath: 'scene/x.png', version: 1 },
  { _id: '2', id: 'sword', kind: 'weapon', displayName: '검',
    glyphAscii: '/', glyphUnicode: 'X', glyphGameIcon: 'X',
    pickupMessage: '획득', attackPower: 7, element: 'fire', version: 2 },
  { _id: '3', id: 'leather_armor', kind: 'armor', displayName: '가죽 갑옷',
    glyphAscii: ']', glyphUnicode: 'X', glyphGameIcon: 'X',
    pickupMessage: '획득', defenseBonus: 2, version: 1 },
  { _id: '4', id: 'health_potion', kind: 'consumable', displayName: '체력 물약',
    glyphAscii: '!', glyphUnicode: '❤', glyphGameIcon: '❤',
    pickupMessage: '획득', effect: { type: 'Heal', amount: 8 }, version: 3 },
];

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    json: async () => ({ data: mockItems }),
    ok: true,
  } as Response);
});

describe('ItemsPage 렌더', () => {
  it('타이틀과 모든 kind 의 item 을 표시한다', async () => {
    render(<ItemsPage />);
    await act(async () => {});
    expect(screen.getByText('Item 카탈로그')).toBeTruthy();
    expect(screen.getByText('영원의 보석')).toBeTruthy();
    expect(screen.getByText('검')).toBeTruthy();
    expect(screen.getByText('가죽 갑옷')).toBeTruthy();
    expect(screen.getByText('체력 물약')).toBeTruthy();
  });

  it('kind 필터 버튼에 카운트가 표시된다', async () => {
    render(<ItemsPage />);
    await act(async () => {});
    expect(screen.getByText('전체 (4)')).toBeTruthy();
    expect(screen.getByText('quest (1)')).toBeTruthy();
    expect(screen.getByText('weapon (1)')).toBeTruthy();
    expect(screen.getByText('armor (1)')).toBeTruthy();
    expect(screen.getByText('consumable (1)')).toBeTruthy();
  });

  it('weapon 필터를 누르면 weapon 만 보인다', async () => {
    render(<ItemsPage />);
    await act(async () => {});
    fireEvent.click(screen.getByText('weapon (1)'));
    expect(screen.getByText('검')).toBeTruthy();
    expect(screen.queryByText('영원의 보석')).toBeNull();
    expect(screen.queryByText('가죽 갑옷')).toBeNull();
  });

  it('weapon 의 종별 요약 (ATK/element)', async () => {
    const { container } = render(<ItemsPage />);
    await act(async () => {});
    expect(container.textContent).toContain('ATK 7');
    expect(container.textContent).toContain('(fire)');
  });

  it('각 행에 히스토리 링크가 렌더된다', async () => {
    render(<ItemsPage />);
    await act(async () => {});
    expect(screen.getAllByText('히스토리 (v1)').length).toBe(2); // gem, leather_armor
    expect(screen.getByText('히스토리 (v2)')).toBeTruthy(); // sword
    expect(screen.getByText('히스토리 (v3)')).toBeTruthy(); // potion
  });
});

describe('ItemsPage 빈 상태', () => {
  it('등록된 item 이 없으면 안내', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({ data: [] }),
      ok: true,
    } as Response);
    render(<ItemsPage />);
    await act(async () => {});
    expect(screen.getByText(/등록된 item 이 없습니다/)).toBeTruthy();
  });
});

describe('ItemsPage 내보내기 버튼', () => {
  it('전체 필터에서는 내보내기 비활성', async () => {
    render(<ItemsPage />);
    await act(async () => {});
    const btn = screen.getByText('내보내기') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('특정 kind 선택 시 활성화 + kind 표기', async () => {
    render(<ItemsPage />);
    await act(async () => {});
    fireEvent.click(screen.getByText('weapon (1)'));
    expect(screen.getByText('weapon 내보내기')).toBeTruthy();
  });
});
