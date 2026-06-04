// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChoiceEditor, reorderChoices } from './choiceEditor';
import type { Choice } from '@/types/web-adventure';

const allSceneIds = ['scene_a', 'scene_b', 'scene_c'];

describe('ChoiceEditor — drag', () => {
  it('각 choice 카드에 cursor-grab 스타일 적용', () => {
    const choices: Choice[] = [
      { kind: 'plain', id: 'c1', label: '선택1', to: 'scene_a' },
    ];
    const { container } = render(
      <ChoiceEditor choices={choices} onChange={vi.fn()} allSceneIds={allSceneIds} />
    );
    const card = container.querySelector('[data-sortable-card]');
    expect(card?.className).toMatch(/cursor-(grab|move)/);
  });

  it('reorderChoices 가 0 → 2 이동 시 배열 재배치', () => {
    const choices: Choice[] = [
      { kind: 'plain', id: 'A', label: 'A', to: 'scene_a' },
      { kind: 'plain', id: 'B', label: 'B', to: 'scene_a' },
      { kind: 'plain', id: 'C', label: 'C', to: 'scene_a' },
    ];
    const result = reorderChoices(choices, 0, 2);
    expect(result.map((c) => c.id)).toEqual(['B', 'C', 'A']);
  });
});

describe('ChoiceEditor — kind 별 폼', () => {
  it('plain → to 씬 selector (allSceneIds 옵션 포함)', () => {
    const choices: Choice[] = [
      { kind: 'plain', id: 'c1', label: '계속', to: 'scene_a' },
    ];
    const { container } = render(
      <ChoiceEditor choices={choices} onChange={vi.fn()} allSceneIds={allSceneIds} />
    );
    const toSelect = screen.getByLabelText('to') as HTMLSelectElement;
    expect(toSelect.value).toBe('scene_a');
    const options = Array.from(toSelect.options).map((o) => o.value);
    expect(options).toContain('scene_a');
    expect(options).toContain('scene_b');
    expect(options).toContain('scene_c');
    // datalist 가 아니라 select 임
    expect(container.querySelector('select[aria-label="to"]')).not.toBeNull();
  });

  it('probability → stat + difficulty + onSuccess + onFailure 노출', () => {
    const choices: Choice[] = [
      {
        kind: 'probability',
        id: 'c1',
        label: '도전',
        stat: 'str',
        difficulty: 10,
        onSuccess: 'scene_a',
        onFailure: 'scene_b',
      },
    ];
    render(<ChoiceEditor choices={choices} onChange={vi.fn()} allSceneIds={allSceneIds} />);
    expect(screen.getByLabelText('stat')).toBeTruthy();
    expect(screen.getByLabelText('난이도')).toBeTruthy();
    expect(screen.getByLabelText('onSuccess')).toBeTruthy();
    expect(screen.getByLabelText('onFailure')).toBeTruthy();
  });

  it('conditional → conditionBuilder + to 노출', () => {
    const choices: Choice[] = [
      {
        kind: 'conditional',
        id: 'c1',
        label: '특수',
        condition: { kind: 'minStat', stat: 'str', min: 7 },
        to: 'scene_a',
      },
    ];
    render(<ChoiceEditor choices={choices} onChange={vi.fn()} allSceneIds={allSceneIds} />);
    expect(screen.getByLabelText('to')).toBeTruthy();
    // condition kind select 가 있어야 함
    expect(screen.getByLabelText('condition kind')).toBeTruthy();
  });
});

describe('ChoiceEditor — 추가/삭제/검증', () => {
  it('choice 추가 버튼 클릭 시 onChange 가 길이 +1 배열로 호출', () => {
    const fn = vi.fn();
    render(<ChoiceEditor choices={[]} onChange={fn} allSceneIds={allSceneIds} />);
    fireEvent.click(screen.getByText('+ 선택지 추가'));
    expect(fn).toHaveBeenCalled();
    const arg = fn.mock.calls[fn.mock.calls.length - 1][0] as Choice[];
    expect(arg.length).toBe(1);
  });

  it('choice 삭제 버튼 클릭 → confirm 후 onChange 가 길이 -1 배열로 호출', () => {
    const fn = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const choices: Choice[] = [
      { kind: 'plain', id: 'c1', label: '계속', to: 'scene_a' },
    ];
    render(<ChoiceEditor choices={choices} onChange={fn} allSceneIds={allSceneIds} />);
    fireEvent.click(screen.getByLabelText('선택지 c1 삭제'));
    expect(confirmSpy).toHaveBeenCalled();
    const arg = fn.mock.calls[fn.mock.calls.length - 1][0] as Choice[];
    expect(arg.length).toBe(0);
    confirmSpy.mockRestore();
  });

  it('id 빈 값이면 validation 메시지', () => {
    const choices: Choice[] = [
      { kind: 'plain', id: '', label: '계속', to: 'scene_a' },
    ];
    render(<ChoiceEditor choices={choices} onChange={vi.fn()} allSceneIds={allSceneIds} />);
    expect(screen.getAllByText(/ID.*필수/).length).toBeGreaterThan(0);
  });

  it('label 빈 값이면 validation 메시지', () => {
    const choices: Choice[] = [
      { kind: 'plain', id: 'c1', label: '', to: 'scene_a' },
    ];
    render(<ChoiceEditor choices={choices} onChange={vi.fn()} allSceneIds={allSceneIds} />);
    expect(screen.getAllByText(/라벨.*필수/).length).toBeGreaterThan(0);
  });
});
