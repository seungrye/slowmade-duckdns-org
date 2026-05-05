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
