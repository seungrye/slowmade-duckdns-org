// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ItemCombobox } from './item-combobox';
import type { ItemDocument } from '@/types/item';

const noop = vi.fn();

const mockItems: ItemDocument[] = [
  {
    _id: '1', id: 'eternal_gem', kind: 'quest', displayName: '영원의 보석',
    glyphAscii: '*', glyphGameIcon: '◆',
    pickupMessage: '획득', imagePath: 'scene/x.png',
    version: 1, createdAt: '', updatedAt: '',
  },
  {
    _id: '2', id: 'sword', kind: 'weapon', displayName: '검',
    glyphAscii: '/', glyphGameIcon: 'X',
    pickupMessage: '획득', attackPower: 7, element: 'fire',
    version: 1, createdAt: '', updatedAt: '',
  },
  {
    _id: '3', id: 'leather_armor', kind: 'armor', displayName: '가죽 갑옷',
    glyphAscii: ']', glyphGameIcon: 'X',
    pickupMessage: '획득', defenseBonus: 2,
    version: 1, createdAt: '', updatedAt: '',
  },
  {
    _id: '4', id: 'health_potion', kind: 'consumable', displayName: '체력 물약',
    glyphAscii: '!', glyphGameIcon: '❤',
    pickupMessage: '획득', effect: { type: 'Heal', amount: 8 },
    version: 1, createdAt: '', updatedAt: '',
  },
];

describe('ItemCombobox', () => {
  it('items 의 id 를 datalist 옵션으로 렌더 (4 종 모두)', () => {
    const { container } = render(<ItemCombobox value="" onChange={noop} items={mockItems} />);
    const options = container.querySelectorAll('datalist option');
    expect(options.length).toBe(4);
    const values = Array.from(options).map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['eternal_gem', 'sword', 'leather_armor', 'health_potion']);
  });

  it('weapon 매칭 시 hint div 에 ATK · element 표시', () => {
    const { container } = render(<ItemCombobox value="sword" onChange={noop} items={mockItems} />);
    const hint = container.querySelector('div.text-gray-400');
    expect(hint?.textContent).toContain('weapon · ATK 7 (fire)');
  });

  it('consumable 매칭 시 hint div 에 Heal +amount', () => {
    const { container } = render(<ItemCombobox value="health_potion" onChange={noop} items={mockItems} />);
    const hint = container.querySelector('div.text-gray-400');
    expect(hint?.textContent).toContain('consumable · Heal +8');
  });

  it('armor 매칭 시 hint div 에 DEF +bonus', () => {
    const { container } = render(<ItemCombobox value="leather_armor" onChange={noop} items={mockItems} />);
    const hint = container.querySelector('div.text-gray-400');
    expect(hint?.textContent).toContain('armor · DEF +2');
  });

  it('미등록 id 면 ? 경고 마커', () => {
    render(<ItemCombobox value="없는_id" onChange={noop} items={mockItems} />);
    expect(screen.getByText('?')).toBeTruthy();
  });

  it('빈 value 면 경고 없음', () => {
    const { container } = render(<ItemCombobox value="" onChange={noop} items={mockItems} />);
    expect(container.querySelector('span[title*="등록되지 않은"]')).toBeNull();
  });

  it('입력 변경이 onChange 로 전달된다', () => {
    const fn = vi.fn();
    render(<ItemCombobox value="" onChange={fn} items={mockItems} />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sword' } });
    expect(fn).toHaveBeenCalledWith('sword');
  });
});
