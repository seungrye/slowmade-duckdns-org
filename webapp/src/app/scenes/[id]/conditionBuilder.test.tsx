// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConditionBuilder } from './conditionBuilder';
import type { ChoiceCondition } from '@/types/web-adventure';

describe('ConditionBuilder', () => {
  it('minStat 선택 시 stat select (6 옵션) + min number 입력 노출', () => {
    const cond: ChoiceCondition = { kind: 'minStat', stat: 'str', min: 7 };
    render(<ConditionBuilder condition={cond} onChange={vi.fn()} />);
    const statSel = screen.getByLabelText('stat') as HTMLSelectElement;
    const values = Array.from(statSel.options).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['str', 'dex', 'int', 'cha', 'con', 'wis']));
    expect(values.length).toBeGreaterThanOrEqual(6);
    const minInput = screen.getByLabelText('min') as HTMLInputElement;
    expect(minInput.type).toBe('number');
    expect(minInput.value).toBe('7');
  });

  it('hasItem 선택 시 itemId 텍스트 입력 노출', () => {
    const cond: ChoiceCondition = { kind: 'hasItem', itemId: 'eternal_gem' };
    render(<ConditionBuilder condition={cond} onChange={vi.fn()} />);
    const itemInput = screen.getByLabelText('itemId') as HTMLInputElement;
    expect(itemInput.value).toBe('eternal_gem');
  });

  it('flag 선택 시 key 텍스트 입력 노출', () => {
    const cond: ChoiceCondition = { kind: 'flag', key: 'visited' };
    render(<ConditionBuilder condition={cond} onChange={vi.fn()} />);
    const keyInput = screen.getByLabelText('flag key') as HTMLInputElement;
    expect(keyInput.value).toBe('visited');
  });

  it('kind 전환 시 onChange 가 기본값으로 초기화된 condition 으로 호출', () => {
    const fn = vi.fn();
    const cond: ChoiceCondition = { kind: 'minStat', stat: 'str', min: 7 };
    render(<ConditionBuilder condition={cond} onChange={fn} />);
    const kindSel = screen.getByLabelText('condition kind') as HTMLSelectElement;
    fireEvent.change(kindSel, { target: { value: 'hasItem' } });
    expect(fn).toHaveBeenCalled();
    const arg = fn.mock.calls[fn.mock.calls.length - 1][0] as ChoiceCondition;
    expect(arg.kind).toBe('hasItem');
    // 다른 필드들이 사라져야 함 (stat / min 없음)
    expect((arg as { stat?: string }).stat).toBeUndefined();
    expect((arg as { min?: number }).min).toBeUndefined();
  });

  it('minStat 의 stat 변경 시 onChange 가 호출', () => {
    const fn = vi.fn();
    const cond: ChoiceCondition = { kind: 'minStat', stat: 'str', min: 7 };
    render(<ConditionBuilder condition={cond} onChange={fn} />);
    const statSel = screen.getByLabelText('stat') as HTMLSelectElement;
    fireEvent.change(statSel, { target: { value: 'int' } });
    const arg = fn.mock.calls[fn.mock.calls.length - 1][0] as ChoiceCondition;
    expect(arg).toMatchObject({ kind: 'minStat', stat: 'int', min: 7 });
  });
});
