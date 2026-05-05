// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActionEditor } from './action-editor';

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
    // 타입 선택 + 페이즈 선택 드롭다운 2개
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
    // flag 입력 + value 입력 둘 다 있어야 함
    expect(inputs.some((el) => (el as HTMLInputElement).value === 'weapon')).toBe(true);
    expect(inputs.some((el) => (el as HTMLInputElement).value === 'greatsword')).toBe(true);
  });
});
