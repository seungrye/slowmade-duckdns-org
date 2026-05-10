// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  it('GiveItems 액션의 itemId + count 입력이 렌더된다', () => {
    render(
      <ActionEditor
        actions={[{ type: 'GiveItems', itemId: 'health_potion', count: 5 }]}
        onChange={noop}
        phaseIds={[]}
      />
    );
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.some((el) => (el as HTMLInputElement).value === 'health_potion')).toBe(true);
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
  it('placement 미지정 시 select 가 "기본" 옵션으로 표시된다', () => {
    render(
      <ActionEditor
        actions={[{ type: 'OpenPortal', zone: 'cave', generator: 'bsp' }]}
        onChange={noop}
        phaseIds={[]}
      />
    );
    const selects = screen.getAllByRole('combobox');
    // 첫 select 는 액션 타입, 두 번째는 placement
    expect((selects[1] as HTMLSelectElement).value).toBe('__default__');
    // radius 입력은 미렌더 (NearGiver 가 아니므로)
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
    const selects = screen.getAllByRole('combobox');
    expect((selects[1] as HTMLSelectElement).value).toBe('Border');
  });

  it('placement: NearGiver 일 때 radius 입력이 추가로 렌더된다', () => {
    render(
      <ActionEditor
        actions={[{ type: 'OpenPortal', zone: 'z', generator: 'g', placement: { type: 'NearGiver', radius: 7 } }]}
        onChange={noop}
        phaseIds={[]}
      />
    );
    const selects = screen.getAllByRole('combobox');
    expect((selects[1] as HTMLSelectElement).value).toBe('NearGiver');
    const numbers = screen.getAllByRole('spinbutton');
    expect(numbers.some((el) => (el as HTMLInputElement).value === '7')).toBe(true);
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
