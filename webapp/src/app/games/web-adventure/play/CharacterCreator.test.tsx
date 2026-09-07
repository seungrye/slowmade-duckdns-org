// CharacterCreator - #258, stat allocation removed plus protagonist and stigma selection.
// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CharacterCreator from './CharacterCreator';

describe('CharacterCreator (#258 스탯 분배 제거)', () => {
  it('스탯 +/- 버튼이 없다', () => {
    render(<CharacterCreator onComplete={vi.fn()} />);
    expect(screen.queryByLabelText(/완력.*증가/)).toBeNull();
    expect(screen.queryByLabelText(/민첩.*감소/)).toBeNull();
    expect(screen.queryByText(/보너스 \d+ 포인트/)).toBeNull();
  });

  it('주인공 3 카드 + 성흔 4 카드 표시 + 모험 시작 버튼 즉시 활성화', () => {
    render(<CharacterCreator onComplete={vi.fn()} />);
    expect(screen.getAllByText(/카엘 \(Kael\)/).length).toBeGreaterThan(0);
    expect(screen.getByText(/린 \(Rin\)/)).toBeInTheDocument();
    expect(screen.getByText(/솔벤 \(Solwen\)/)).toBeInTheDocument();
    expect(screen.getByText('루나 성흔')).toBeInTheDocument();
    expect(screen.getByText('셀레네 성흔')).toBeInTheDocument();
    expect(screen.getByText('헤카테 성흔')).toBeInTheDocument();
    expect(screen.getByText('무흔')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /운명으로 발을 내딛는다/ });
    expect(btn).not.toBeDisabled();
  });

  it('Kael 기본 선택 → 모험 시작 클릭 시 protagonist=kael + startScene=kael_infirmary', () => {
    const onComplete = vi.fn();
    render(<CharacterCreator onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /운명으로 발을 내딛는다/ }));
    expect(onComplete).toHaveBeenCalledOnce();
    const [character, startScene] = onComplete.mock.calls[0];
    expect(character.protagonist).toBe('kael');
    expect(character.stigmaErosion).toBe(80);
    expect(startScene).toBe('kael_infirmary');
    // Kael's base stats as they are (no allocation).
    expect(character.stats.int).toBe(7);
    expect(character.stats.con).toBe(4);
  });

  it('Solwen 카드 클릭 → 모험 시작 시 protagonist=solwen + startScene=solwen_grove', () => {
    const onComplete = vi.fn();
    render(<CharacterCreator onComplete={onComplete} />);
    fireEvent.click(screen.getByText(/솔벤 \(Solwen\)/));
    fireEvent.click(screen.getByRole('button', { name: /운명으로 발을 내딛는다/ }));
    const [character, startScene] = onComplete.mock.calls[0];
    expect(character.protagonist).toBe('solwen');
    expect(character.stigmaErosion).toBe(0);
    expect(startScene).toBe('solwen_grove');
    expect(character.inventory).toContain('sylvan_bow');
  });

  it('성흔 선택 변경 → 무흔 선택 시 rerollsLeft=3', () => {
    const onComplete = vi.fn();
    render(<CharacterCreator onComplete={onComplete} />);
    fireEvent.click(screen.getByText('무흔'));
    fireEvent.click(screen.getByRole('button', { name: /운명으로 발을 내딛는다/ }));
    const [character] = onComplete.mock.calls[0];
    expect(character.ability).toBe('none');
    expect(character.rerollsLeft).toBe(3);
  });

  // #291 - the con/dex debuff is shown in advance when the starting contamination is >= 50.
  it('Kael 선택 → 시작 침식 80 디버프 경고 표시 + 체력/민첩 -2 effective', () => {
    render(<CharacterCreator onComplete={vi.fn()} />);
    // Kael by default - the contamination 80 card is active.
    expect(screen.getByTestId('stigma-debuff-warning')).toBeInTheDocument();
    expect(screen.getByTestId('stigma-debuff-warning')).toHaveTextContent(/80/);
    // shows -2 (constitution 4-2 / dexterity 6-2)
    expect(screen.getByText(/\(4-2\)/)).toBeInTheDocument();
    expect(screen.getByText(/\(6-2\)/)).toBeInTheDocument();
  });

  it('Solwen 선택 → 시작 침식 0 → 디버프 경고 미표시', () => {
    render(<CharacterCreator onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { pressed: false, name: /솔벤|Solwen/i }));
    expect(screen.queryByTestId('stigma-debuff-warning')).toBeNull();
  });
});
