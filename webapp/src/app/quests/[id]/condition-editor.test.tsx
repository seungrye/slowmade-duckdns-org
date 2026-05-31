// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConditionEditor } from './condition-editor';

const noop = vi.fn();

describe('ConditionEditor', () => {
  it('Always 조건을 렌더한다', () => {
    render(<ConditionEditor condition={{ type: 'Always' }} onChange={noop} />);
    expect(screen.getByRole('combobox')).toHaveValue('Always');
  });

  it('FlagIs 조건의 flag/value 입력을 렌더한다', () => {
    render(<ConditionEditor condition={{ type: 'FlagIs', flag: 'weapon', value: 'greatsword' }} onChange={noop} />);
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.some((el) => (el as HTMLInputElement).value === 'weapon')).toBe(true);
    expect(inputs.some((el) => (el as HTMLInputElement).value === 'greatsword')).toBe(true);
  });

  it('And 조건의 서브 조건 목록을 렌더한다', () => {
    render(
      <ConditionEditor
        condition={{
          type: 'And',
          conditions: [
            { type: 'FlagIs', flag: 'weapon', value: 'greatsword' },
            { type: 'FlagIs', flag: 'values', value: 'honor' },
          ],
        }}
        onChange={noop}
      />
    );
    expect(screen.getAllByRole('combobox')[0]).toHaveValue('And');
    // 서브 조건 두 개의 flag 입력이 있어야 함
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.some((el) => (el as HTMLInputElement).value === 'weapon')).toBe(true);
    expect(inputs.some((el) => (el as HTMLInputElement).value === 'values')).toBe(true);
  });

  it('Not 조건의 서브 조건을 렌더한다', () => {
    render(
      <ConditionEditor
        condition={{ type: 'Not', condition: { type: 'HasItem', itemId: 'dragon_scale' } }}
        onChange={noop}
      />
    );
    // HasItem 은 ItemCombobox (input list=...) 로 role=combobox
    expect(screen.getByDisplayValue('dragon_scale')).toBeTruthy();
  });

  it('PhaseIs 조건의 quest/phase 입력을 렌더한다', () => {
    render(
      <ConditionEditor
        condition={{ type: 'PhaseIs', quest: 'stark_quest', phase: 'done' }}
        onChange={noop}
      />
    );
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.some((el) => (el as HTMLInputElement).value === 'stark_quest')).toBe(true);
    expect(inputs.some((el) => (el as HTMLInputElement).value === 'done')).toBe(true);
  });

  it('HasFlag 조건의 flag 입력을 렌더한다', () => {
    render(
      <ConditionEditor
        condition={{ type: 'HasFlag', flag: 'herbalist_killed' }}
        onChange={noop}
      />
    );
    expect(screen.getByRole('combobox')).toHaveValue('HasFlag');
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.some((el) => (el as HTMLInputElement).value === 'herbalist_killed')).toBe(true);
  });

  it('InZone(Named) 의 id 자리에 ZoneCombobox + datalist 옵션 노출', () => {
    const zones = [
      {
        _id: '1', name: 'herb_glade', generator: 'forest', description: '약초',
        version: 1, createdAt: '', updatedAt: '',
      },
    ];
    const { container } = render(
      <ConditionEditor
        condition={{ type: 'InZone', zone: { type: 'Named', id: 'herb_glade' } }}
        onChange={noop}
        zones={zones}
      />
    );
    expect(screen.getByDisplayValue('herb_glade')).toBeTruthy();
    const opts = container.querySelectorAll('datalist option');
    const values = Array.from(opts).map((o) => (o as HTMLOptionElement).value);
    expect(values).toContain('herb_glade');
  });

  it('HasItem 의 itemId 자리에 ItemCombobox + datalist 옵션 노출', () => {
    const items = [
      {
        _id: '1', id: 'eternal_gem', kind: 'quest' as const, displayName: '영원의 보석',
        glyphAscii: '*', glyphGameIcon: '◆',
        pickupMessage: '획득', imagePath: 'scene/x.png',
        version: 1, createdAt: '', updatedAt: '',
      },
    ];
    const { container } = render(
      <ConditionEditor
        condition={{ type: 'HasItem', itemId: 'eternal_gem' }}
        onChange={noop}
        items={items}
      />
    );
    const opts = container.querySelectorAll('datalist option');
    expect(Array.from(opts).some((o) => (o as HTMLOptionElement).value === 'eternal_gem')).toBe(true);
    // 매칭된 id 의 힌트 (displayName · summary)
    expect(container.textContent).toContain('영원의 보석');
  });
});
