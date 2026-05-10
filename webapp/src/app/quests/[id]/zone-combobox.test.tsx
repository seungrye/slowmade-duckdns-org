// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ZoneCombobox } from './zone-combobox';
import type { ZoneDocument } from '@/types/zone';

const noop = vi.fn();

const mockZones: ZoneDocument[] = [
  { _id: '1', name: 'demon_cave', generator: 'cellular_automata', description: '마귀 동굴', version: 1, createdAt: '', updatedAt: '' },
  { _id: '2', name: 'herb_glade', generator: 'forest', description: '', version: 1, createdAt: '', updatedAt: '' },
];

describe('ZoneCombobox', () => {
  it('zones 의 name 을 datalist 옵션으로 렌더', () => {
    const { container } = render(<ZoneCombobox value="" onChange={noop} zones={mockZones} />);
    const opts = container.querySelectorAll('datalist option');
    expect(opts.length).toBe(2);
    const values = Array.from(opts).map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['demon_cave', 'herb_glade']);
  });

  it('매칭된 value 의 generator + description 힌트 div', () => {
    const { container } = render(<ZoneCombobox value="demon_cave" onChange={noop} zones={mockZones} />);
    const hint = container.querySelector('div.text-gray-400');
    expect(hint?.textContent).toContain('generator:');
    expect(hint?.textContent).toContain('cellular_automata');
    expect(hint?.textContent).toContain('마귀 동굴');
  });

  it('description 없는 zone 은 generator 만 힌트', () => {
    const { container } = render(<ZoneCombobox value="herb_glade" onChange={noop} zones={mockZones} />);
    const hint = container.querySelector('div.text-gray-400');
    expect(hint?.textContent).toContain('forest');
  });

  it('미등록 value 는 ? 마커', () => {
    render(<ZoneCombobox value="없는_존" onChange={noop} zones={mockZones} />);
    expect(screen.getByText('?')).toBeTruthy();
  });

  it('빈 value 는 경고 없음', () => {
    const { container } = render(<ZoneCombobox value="" onChange={noop} zones={mockZones} />);
    expect(container.querySelector('span[title*="등록되지 않은"]')).toBeNull();
  });

  it('입력 변경이 onChange 로 전달', () => {
    const fn = vi.fn();
    render(<ZoneCombobox value="" onChange={fn} zones={mockZones} />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'demon_cave' } });
    expect(fn).toHaveBeenCalledWith('demon_cave');
  });
});
