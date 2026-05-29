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

describe('ItemsPage 다중 선택 삭제', () => {
  it('선택 삭제 버튼은 선택이 없으면 비활성', async () => {
    render(<ItemsPage />);
    await act(async () => {});
    const btn = screen.getByText('선택 삭제 (0)') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('행 체크박스를 누르면 선택 수가 늘어난다', async () => {
    render(<ItemsPage />);
    await act(async () => {});
    fireEvent.click(screen.getByLabelText('eternal_gem 선택'));
    expect(screen.getByText('선택 삭제 (1)')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('sword 선택'));
    expect(screen.getByText('선택 삭제 (2)')).toBeTruthy();
  });

  it('전체 선택을 누르면 보이는 항목이 모두 선택된다', async () => {
    render(<ItemsPage />);
    await act(async () => {});
    fireEvent.click(screen.getByLabelText('전체 선택'));
    expect(screen.getByText('선택 삭제 (4)')).toBeTruthy();
  });

  it('전체 선택은 현재 필터로 보이는 항목만 대상', async () => {
    render(<ItemsPage />);
    await act(async () => {});
    fireEvent.click(screen.getByText('weapon (1)'));
    fireEvent.click(screen.getByLabelText('전체 선택'));
    expect(screen.getByText('선택 삭제 (1)')).toBeTruthy();
  });

  it('선택 삭제 시 bulk-delete API 를 호출하고 목록을 재로드한다', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({ data: mockItems }),
      ok: true,
    } as Response);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ItemsPage />);
    await act(async () => {});
    fireEvent.click(screen.getByLabelText('eternal_gem 선택'));
    fireEvent.click(screen.getByLabelText('sword 선택'));

    await act(async () => { fireEvent.click(screen.getByText('선택 삭제 (2)')); });

    const bulkCall = fetchMock.mock.calls.find(
      ([url]) => url === '/api/quests/items/bulk-delete',
    );
    expect(bulkCall).toBeTruthy();
    const init = bulkCall![1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ ids: ['eternal_gem', 'sword'] });
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

describe('ItemsPage glyph_unicode 아이콘 픽커', () => {
  it('"+ 새 item" 폼에 "아이콘 선택" 버튼이 있다', async () => {
    render(<ItemsPage />);
    await act(async () => {});
    fireEvent.click(screen.getByText('+ 새 item'));
    expect(screen.getByTitle('RPG-Awesome 아이콘 선택')).toBeTruthy();
  });

  it('"아이콘 선택" 버튼을 누르면 픽커 모달이 열린다', async () => {
    render(<ItemsPage />);
    await act(async () => {});
    fireEvent.click(screen.getByText('+ 새 item'));
    fireEvent.click(screen.getByTitle('RPG-Awesome 아이콘 선택'));
    expect(screen.getByText(/아이콘 선택 \(RPG-Awesome\)/)).toBeTruthy();
  });

  it('픽커에서 아이콘 선택 시 glyph_unicode 입력 값이 \\u{XXXX} 로 채워진다', async () => {
    const { container } = render(<ItemsPage />);
    await act(async () => {});
    fireEvent.click(screen.getByText('+ 새 item'));
    fireEvent.click(screen.getByTitle('RPG-Awesome 아이콘 선택'));
    const search = screen.getByPlaceholderText(/아이콘 이름 검색/) as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'broadsword' } });
    fireEvent.click(screen.getByRole('button', { name: /broadsword 선택/ }));
    // 폼의 glyph_unicode 입력에 \u{E946} 가 들어와야 한다 (placeholder 와 같은 입력).
    const inputs = container.querySelectorAll('input.font-mono');
    const glyphUnicodeInput = Array.from(inputs).find(
      (el) => (el as HTMLInputElement).placeholder === '\\u{E946}',
    ) as HTMLInputElement;
    expect(glyphUnicodeInput.value).toBe('\\u{E946}');
  });
});
