// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NpcCombobox } from './npc-combobox';
import type { VillagerDocument } from '@/types/villager';

const noop = vi.fn();

const mockVillagers: VillagerDocument[] = [
  { _id: '1', id: 'elder', name: '장로', color: [0.9, 0.8, 0.5], dialogs: [], speed: 0.5, version: 1, createdAt: '', updatedAt: '' },
  { _id: '2', id: 'burgomaster', name: '촌장', color: [1, 0.85, 0], dialogs: [], speed: 1.0, version: 1, createdAt: '', updatedAt: '' },
];

describe('NpcCombobox', () => {
  it('villagers 의 id 를 datalist 옵션 value, name 을 라벨로 렌더', () => {
    const { container } = render(<NpcCombobox value="" onChange={noop} villagers={mockVillagers} />);
    const options = container.querySelectorAll('datalist option');
    expect(options.length).toBe(2);
    expect((options[0] as HTMLOptionElement).value).toBe('elder');
    expect((options[0] as HTMLOptionElement).textContent).toBe('장로');
    expect((options[1] as HTMLOptionElement).value).toBe('burgomaster');
  });

  it('value(id) 가 등록된 villager 면 name 힌트 표시', () => {
    const { container } = render(<NpcCombobox value="elder" onChange={noop} villagers={mockVillagers} />);
    // 힌트는 datalist 밖의 .text-gray-400 div. (datalist option 에도 name 이 있어 getByText 는 모호)
    const hint = container.querySelector('div.text-gray-400');
    expect(hint?.textContent).toBe('장로');
  });

  it('value 가 미등록 id 면 ? 경고 마커 표시', () => {
    render(<NpcCombobox value="없는id" onChange={noop} villagers={mockVillagers} />);
    expect(screen.getByText('?')).toBeTruthy();
  });

  it('value 가 빈 문자열이면 경고 없음', () => {
    const { container } = render(<NpcCombobox value="" onChange={noop} villagers={mockVillagers} />);
    expect(container.querySelector('span[title*="등록되지 않은"]')).toBeNull();
  });

  it('입력 변경이 onChange 로 전달된다', () => {
    const fn = vi.fn();
    render(<NpcCombobox value="" onChange={fn} villagers={mockVillagers} />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'elder' } });
    expect(fn).toHaveBeenCalledWith('elder');
  });

  it('villagers 가 빈 배열이면 datalist 도 비어있고 모든 입력은 미등록 처리', () => {
    const { container } = render(<NpcCombobox value="x" onChange={noop} villagers={[]} />);
    expect(container.querySelectorAll('datalist option').length).toBe(0);
    expect(screen.getByText('?')).toBeTruthy();
  });
});
