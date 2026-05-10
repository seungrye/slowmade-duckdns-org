// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionEditor } from './action-editor';
// flattenBranch / unflattenBranch은 모듈 내부 함수라 UI로 간접 검증

const noop = vi.fn();

describe('ActionEditor — AdvancePhase', () => {
  it('AdvancePhase 액션이 페이즈 선택 드롭다운을 렌더한다', () => {
    render(
      <ActionEditor
        actions={[{ type: 'AdvancePhase', phaseId: 'active' }]}
        onChange={noop}
        phaseIds={['dormant', 'active', 'done']}
      />
    );
    const select = screen.getAllByRole('combobox');
    expect(select.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ActionEditor — SetFlag', () => {
  it('SetFlag 액션의 두 입력 필드가 렌더된다', () => {
    render(
      <ActionEditor
        actions={[{ type: 'SetFlag', flag: 'weapon', value: 'greatsword' }]}
        onChange={noop}
        phaseIds={[]}
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
        phaseIds={[]}
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
        phaseIds={[]}
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
        phaseIds={[]}
      />
    );
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.some((el) => (el as HTMLInputElement).value === 'demon_cave')).toBe(true);
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
        phaseIds={[]}
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
        phaseIds={[]}
      />
    );
    expect(findPlacementSelect().value).toBe('Border');
  });

  it('placement: NearGiver 일 때 radius 입력이 추가로 렌더된다', () => {
    render(
      <ActionEditor
        actions={[{ type: 'OpenPortal', zone: 'z', generator: 'g', placement: { type: 'NearGiver', radius: 7 } }]}
        onChange={noop}
        phaseIds={[]}
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
      glyphAscii: '*', glyphUnicode: '◆', glyphGameIcon: '◆',
      pickupMessage: '획득', imagePath: 'scene/x.png',
      version: 1, createdAt: '', updatedAt: '',
    },
    {
      _id: '2', id: 'health_potion', kind: 'consumable' as const, displayName: '체력 물약',
      glyphAscii: '!', glyphUnicode: '❤', glyphGameIcon: '❤',
      pickupMessage: '획득', effect: { type: 'Heal' as const, amount: 8 },
      version: 1, createdAt: '', updatedAt: '',
    },
  ];

  it('GiveItem 이 ItemCombobox + datalist 옵션 노출', () => {
    const { container } = render(
      <ActionEditor
        actions={[{ type: 'GiveItem', itemId: 'eternal_gem' }]}
        onChange={noop}
        phaseIds={[]}
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
        phaseIds={[]}
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
        phaseIds={[]}
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
        phaseIds={[]}
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
        phaseIds={[]}
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
        phaseIds={[]}
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
  it('villagers 카탈로그가 datalist 옵션으로 노출되고 현재 npcId 가 입력값', () => {
    const villagers = [
      { _id: '1', name: '장로', color: [0.9, 0.8, 0.5] as [number, number, number], dialogs: [], questId: 'gem_quest', speed: 0.5, version: 1, createdAt: '', updatedAt: '' },
    ];
    const { container } = render(
      <ActionEditor
        actions={[{ type: 'KillNpc', npcId: '장로' }]}
        onChange={noop}
        phaseIds={[]}
        villagers={villagers}
      />
    );
    expect(screen.getByDisplayValue('장로')).toBeTruthy();
    const opts = container.querySelectorAll('datalist option');
    expect(Array.from(opts).some((o) => (o as HTMLOptionElement).value === '장로')).toBe(true);
  });

  it('미등록 npcId 면 ? 경고 마커 표시', () => {
    render(
      <ActionEditor
        actions={[{ type: 'KillNpc', npcId: '없는NPC' }]}
        onChange={noop}
        phaseIds={[]}
        villagers={[]}
      />
    );
    expect(screen.getByText('?')).toBeTruthy();
  });
});

describe('ActionEditor — Branch (switch/case)', () => {
  it('단일 Branch를 case 1 + default 로 렌더한다', () => {
    render(
      <ActionEditor
        actions={[{
          type: 'Branch',
          condition: { type: 'FlagIs', flag: 'weapon', value: 'sword' },
          ifTrue: [{ type: 'AdvancePhase', phaseId: 'a' }],
          ifFalse: [{ type: 'AdvancePhase', phaseId: 'b' }],
        }]}
        onChange={noop}
        phaseIds={['a', 'b']}
      />
    );
    expect(screen.getByText('case 1')).toBeTruthy();
    expect(screen.getByText('default')).toBeTruthy();
  });

  it('중첩 Branch 체인을 case 1, case 2 + default 로 렌더한다', () => {
    render(
      <ActionEditor
        actions={[{
          type: 'Branch',
          condition: { type: 'FlagIs', flag: 'weapon', value: 'sword' },
          ifTrue: [{ type: 'AdvancePhase', phaseId: 'a' }],
          ifFalse: [{
            type: 'Branch',
            condition: { type: 'FlagIs', flag: 'weapon', value: 'bow' },
            ifTrue: [{ type: 'AdvancePhase', phaseId: 'b' }],
            ifFalse: [{ type: 'AdvancePhase', phaseId: 'c' }],
          }],
        }]}
        onChange={noop}
        phaseIds={['a', 'b', 'c']}
      />
    );
    expect(screen.getByText('case 1')).toBeTruthy();
    expect(screen.getByText('case 2')).toBeTruthy();
    expect(screen.getByText('default')).toBeTruthy();
  });
});
