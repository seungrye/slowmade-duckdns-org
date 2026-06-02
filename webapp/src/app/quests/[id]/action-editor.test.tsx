// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionEditor, reorderActions } from './action-editor';
import type { Action } from '@/types/quest';

const noop = vi.fn();

describe('ActionEditor — 순서 변경 (drag-and-drop)', () => {
  it('카드 전체에 cursor-grab 스타일이 적용된다', () => {
    // SortableActionRow 의 wrapper div 에 className 포함 'cursor-grab' 또는 'cursor-move'
    const actions: Action[] = [{ type: 'Log', text: 'first' }];
    const { container } = render(<ActionEditor actions={actions} onChange={() => {}} />);
    const card = container.querySelector('[data-sortable-card]');
    expect(card?.className).toMatch(/cursor-(grab|move)/);
  });

  it('카드 안 input 의 onPointerDown 이 stopPropagation 된다', () => {
    // input 에 onPointerDown handler 가 존재 + 호출 시 stopPropagation
    const actions: Action[] = [{ type: 'Log', text: 'first' }];
    const { container } = render(<ActionEditor actions={actions} onChange={() => {}} />);
    // Log 액션의 textarea 가 stopPropagation 처리되어야 함
    const textarea = container.querySelector('textarea');
    expect(textarea).not.toBeNull();
    // pointerdown 이벤트 시뮬레이션 + stopPropagation 확인 — jsdom 에 PointerEvent 없어서 Event 로 대체
    const event = new Event('pointerdown', { bubbles: true, cancelable: true });
    const stopSpy = vi.spyOn(event, 'stopPropagation');
    textarea!.dispatchEvent(event);
    expect(stopSpy).toHaveBeenCalled();
  });

  it('⋮⋮ grip 핸들이 더 이상 렌더되지 않는다', () => {
    const actions: Action[] = [{ type: 'Log', text: 'first' }];
    const { container } = render(<ActionEditor actions={actions} onChange={() => {}} />);
    expect(container.textContent).not.toContain('⋮⋮');
    // aria-label "드래그로 순서 변경" 도 없음
    expect(container.querySelector('[aria-label*="드래그"]')).toBeNull();
  });

  it('reorderActions 가 0 → 2 이동 시 배열을 정확히 재배치한다', () => {
    const actions: Action[] = [
      { type: 'Log', text: 'A' },
      { type: 'Log', text: 'B' },
      { type: 'Log', text: 'C' },
    ];
    const result = reorderActions(actions, 0, 2);
    expect(result.map((a) => (a as { text: string }).text)).toEqual(['B', 'C', 'A']);
  });

  it('reorderActions 가 같은 index 면 원본 그대로', () => {
    const actions: Action[] = [
      { type: 'Log', text: 'A' },
      { type: 'Log', text: 'B' },
    ];
    const result = reorderActions(actions, 1, 1);
    expect(result).toEqual(actions);
  });

  it('reorderActions 가 마지막 → 처음 이동 시 정확', () => {
    const actions: Action[] = [
      { type: 'Log', text: 'A' },
      { type: 'Log', text: 'B' },
      { type: 'Log', text: 'C' },
    ];
    const result = reorderActions(actions, 2, 0);
    expect(result.map((a) => (a as { text: string }).text)).toEqual(['C', 'A', 'B']);
  });
});

describe('ActionEditor — SetFlag', () => {
  it('SetFlag 액션의 두 입력 필드가 렌더된다', () => {
    render(
      <ActionEditor
        actions={[{ type: 'SetFlag', flag: 'weapon', value: 'greatsword' }]}
        onChange={noop}
      />
    );
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.some((el) => (el as HTMLInputElement).value === 'weapon')).toBe(true);
    expect(inputs.some((el) => (el as HTMLInputElement).value === 'greatsword')).toBe(true);
  });
});

describe('ActionEditor — GiveItems', () => {
  it('GiveItems 액션의 itemId(ItemCombobox) + count 입력이 렌더된다', () => {
    render(
      <ActionEditor
        actions={[{ type: 'GiveItems', itemId: 'health_potion', count: 5 }]}
        onChange={noop}
      />
    );
    expect(screen.getByDisplayValue('health_potion')).toBeTruthy();
    const counts = screen.getAllByRole('spinbutton');
    expect((counts[0] as HTMLInputElement).value).toBe('5');
  });
});

describe('ActionEditor — ClearFlag', () => {
  it('ClearFlag 액션의 flag 입력이 렌더된다', () => {
    render(
      <ActionEditor
        actions={[{ type: 'ClearFlag', flag: 'herb_quest_active' }]}
        onChange={noop}
      />
    );
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.some((el) => (el as HTMLInputElement).value === 'herb_quest_active')).toBe(true);
  });
});

describe('ActionEditor — ClosePortal', () => {
  it('ClosePortal 액션의 zone 입력이 렌더된다', () => {
    render(
      <ActionEditor
        actions={[{ type: 'ClosePortal', zone: 'demon_cave' }]}
        onChange={noop}
      />
    );
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.some((el) => (el as HTMLInputElement).value === 'demon_cave')).toBe(true);
  });
});

describe('ActionEditor — SpawnGuards', () => {
  it('SpawnGuards 액션의 count(number) 입력이 렌더된다', () => {
    render(
      <ActionEditor
        actions={[{ type: 'SpawnGuards', count: 6 }]}
        onChange={noop}
      />
    );
    const counts = screen.getAllByRole('spinbutton');
    expect(counts.some((el) => (el as HTMLInputElement).value === '6')).toBe(true);
  });

  it('count 변경 시 onChange 가 갱신된 액션을 전달한다', () => {
    const fn = vi.fn();
    render(
      <ActionEditor
        actions={[{ type: 'SpawnGuards', count: 1 }]}
        onChange={fn}
      />
    );
    const input = screen.getByPlaceholderText('경비병 수') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '4' } });
    expect(fn).toHaveBeenCalledWith([{ type: 'SpawnGuards', count: 4 }]);
  });

  it('타입 select 에 SpawnGuards 옵션이 있다', () => {
    render(<ActionEditor actions={[{ type: 'Log', text: '' }]} onChange={noop} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain('SpawnGuards');
  });
});

describe('ActionEditor — 액션 타입에 AdvancePhase/Branch 없음', () => {
  it('타입 select 에 AdvancePhase / Branch 옵션이 없다', () => {
    render(<ActionEditor actions={[{ type: 'Log', text: '' }]} onChange={noop} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).not.toContain('AdvancePhase');
    expect(values).not.toContain('Branch');
    expect(values).toContain('Log');
  });
});

describe('ActionEditor — OpenPortal', () => {
  // ZoneCombobox 의 input 도 role=combobox 라 select 만 필터해서 찾는다
  function findPlacementSelect(): HTMLSelectElement {
    const all = screen.getAllByRole('combobox');
    const found = all.find((el) =>
      el.tagName === 'SELECT'
      && Array.from((el as HTMLSelectElement).options).some((o) => o.value === '__default__'),
    );
    return found as HTMLSelectElement;
  }

  it('placement 미지정 시 select 가 "기본" 옵션으로 표시된다', () => {
    render(
      <ActionEditor
        actions={[{ type: 'OpenPortal', zone: 'cave', generator: 'bsp' }]}
        onChange={noop}
      />
    );
    expect(findPlacementSelect().value).toBe('__default__');
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
  });

  it('placement: Border 일 때 select 가 Border 로 선택된다', () => {
    render(
      <ActionEditor
        actions={[{ type: 'OpenPortal', zone: 'glade', generator: 'forest', placement: { type: 'Border' } }]}
        onChange={noop}
      />
    );
    expect(findPlacementSelect().value).toBe('Border');
  });

  it('placement: NearGiver 일 때 radius 입력이 추가로 렌더된다', () => {
    render(
      <ActionEditor
        actions={[{ type: 'OpenPortal', zone: 'z', generator: 'g', placement: { type: 'NearGiver', radius: 7 } }]}
        onChange={noop}
      />
    );
    expect(findPlacementSelect().value).toBe('NearGiver');
    const numbers = screen.getAllByRole('spinbutton');
    expect(numbers.some((el) => (el as HTMLInputElement).value === '7')).toBe(true);
  });
});

describe('ActionEditor — Item picker (ItemCombobox 통합)', () => {
  const items = [
    {
      _id: '1', id: 'eternal_gem', kind: 'quest' as const, displayName: '영원의 보석',
      glyphAscii: '*', glyphGameIcon: '◆',
      pickupMessage: '획득', imagePath: 'scene/x.png',
      version: 1, createdAt: '', updatedAt: '',
    },
    {
      _id: '2', id: 'health_potion', kind: 'consumable' as const, displayName: '체력 물약',
      glyphAscii: '!', glyphGameIcon: '❤',
      pickupMessage: '획득', effect: { type: 'Heal' as const, amount: 8 },
      version: 1, createdAt: '', updatedAt: '',
    },
  ];

  it('GiveItem 이 ItemCombobox + datalist 옵션 노출', () => {
    const { container } = render(
      <ActionEditor
        actions={[{ type: 'GiveItem', itemId: 'eternal_gem' }]}
        onChange={noop}
        items={items}
      />
    );
    expect(screen.getByDisplayValue('eternal_gem')).toBeTruthy();
    const opts = container.querySelectorAll('datalist option');
    expect(Array.from(opts).some((o) => (o as HTMLOptionElement).value === 'eternal_gem')).toBe(true);
  });

  it('GiveItems 의 itemId 는 ItemCombobox, count 는 number input', () => {
    const { container } = render(
      <ActionEditor
        actions={[{ type: 'GiveItems', itemId: 'health_potion', count: 5 }]}
        onChange={noop}
        items={items}
      />
    );
    expect(screen.getByDisplayValue('health_potion')).toBeTruthy();
    const opts = container.querySelectorAll('datalist option');
    expect(Array.from(opts).some((o) => (o as HTMLOptionElement).value === 'health_potion')).toBe(true);
    const counts = screen.getAllByRole('spinbutton');
    expect((counts[0] as HTMLInputElement).value).toBe('5');
  });

  it('RemoveItem 이 미등록 id 일 때 ? 경고', () => {
    render(
      <ActionEditor
        actions={[{ type: 'RemoveItem', itemId: '없는_id' }]}
        onChange={noop}
        items={items}
      />
    );
    expect(screen.getByText('?')).toBeTruthy();
  });
});

describe('ActionEditor — OpenPortal (ZoneCombobox + generator auto-fill)', () => {
  const zones = [
    {
      _id: '1', name: 'demon_cave', generator: 'cellular_automata', description: '동굴',
      version: 1, createdAt: '', updatedAt: '',
    },
  ];

  it('OpenPortal.zone 이 ZoneCombobox + datalist 옵션 노출', () => {
    const { container } = render(
      <ActionEditor
        actions={[{ type: 'OpenPortal', zone: 'demon_cave', generator: 'cellular_automata' }]}
        onChange={noop}
        zones={zones}
      />
    );
    expect(screen.getByDisplayValue('demon_cave')).toBeTruthy();
    const opts = container.querySelectorAll('datalist option');
    expect(Array.from(opts).some((o) => (o as HTMLOptionElement).value === 'demon_cave')).toBe(true);
  });

  it('zone 변경 시 generator 가 비어있으면 카탈로그값으로 자동 채움', () => {
    const fn = vi.fn();
    render(
      <ActionEditor
        actions={[{ type: 'OpenPortal', zone: '', generator: '' }]}
        onChange={fn}
        zones={zones}
      />
    );
    const input = screen.getByPlaceholderText(/존 ID/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'demon_cave' } });
    expect(fn).toHaveBeenCalledWith([
      { type: 'OpenPortal', zone: 'demon_cave', generator: 'cellular_automata' },
    ]);
  });

  it('zone 변경 시 generator 가 이미 있으면 보존', () => {
    const fn = vi.fn();
    render(
      <ActionEditor
        actions={[{ type: 'OpenPortal', zone: '', generator: 'manual_override' }]}
        onChange={fn}
        zones={zones}
      />
    );
    const input = screen.getByPlaceholderText(/존 ID/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'demon_cave' } });
    expect(fn).toHaveBeenCalledWith([
      { type: 'OpenPortal', zone: 'demon_cave', generator: 'manual_override' },
    ]);
  });
});

describe('ActionEditor — KillNpc (NpcCombobox 통합)', () => {
  it('villagers 카탈로그가 datalist 옵션으로 노출되고 현재 npcId(id) 가 입력값', () => {
    const villagers = [
      { _id: '1', id: 'elder', name: '장로', color: [0.9, 0.8, 0.5] as [number, number, number], dialogs: [], speed: 0.5, version: 1, createdAt: '', updatedAt: '' },
    ];
    const { container } = render(
      <ActionEditor
        actions={[{ type: 'KillNpc', npcId: 'elder' }]}
        onChange={noop}
        villagers={villagers}
      />
    );
    expect(screen.getByDisplayValue('elder')).toBeTruthy();
    const opts = container.querySelectorAll('datalist option');
    expect(Array.from(opts).some((o) => (o as HTMLOptionElement).value === 'elder')).toBe(true);
  });

  it('미등록 npcId 면 ? 경고 마커 표시', () => {
    render(
      <ActionEditor
        actions={[{ type: 'KillNpc', npcId: '없는NPC' }]}
        onChange={noop}
        villagers={[]}
      />
    );
    expect(screen.getByText('?')).toBeTruthy();
  });
});
