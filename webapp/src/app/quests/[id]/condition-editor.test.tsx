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
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.some((el) => (el as HTMLInputElement).value === 'dragon_scale')).toBe(true);
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
});
