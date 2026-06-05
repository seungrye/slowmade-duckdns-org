// StatusPanel — #241. 6 스탯 + HP + 어빌 + 인벤 + 회차.
// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StatusPanel from './StatusPanel';
import type { Character } from '@/types/web-adventure';

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    stats: { str: 10, dex: 8, int: 7, cha: 5, con: 6, wis: 4 },
    hp: 6,
    maxHp: 10,
    ability: 'lunar',
    protagonist: 'kael',
    stigmaErosion: 0,
    inventory: ['medical_bandage', 'ether_refined_water'],
    flags: {},
    rerollsLeft: 2,
    ...overrides,
  };
}

describe('StatusPanel', () => {
  it('6 스탯 (str/dex/int/cha/con/wis) 모두 라벨 + 숫자 값으로 표시', () => {
    const character = makeCharacter();
    render(
      <StatusPanel
        character={character}
        runIndex={1}
        canReroll={false}
        onUseItem={vi.fn()}
        onReroll={vi.fn()}
      />,
    );
    for (const stat of ['STR', 'DEX', 'INT', 'CHA', 'CON', 'WIS']) {
      expect(screen.getByText(stat)).toBeInTheDocument();
    }
    expect(screen.getByText('10')).toBeInTheDocument(); // str
    expect(screen.getByText('4')).toBeInTheDocument(); // wis
  });

  it('HP / maxHp 표시', () => {
    render(
      <StatusPanel
        character={makeCharacter()}
        runIndex={1}
        canReroll={false}
        onUseItem={vi.fn()}
        onReroll={vi.fn()}
      />,
    );
    expect(screen.getByText(/HP/)).toBeInTheDocument();
    expect(screen.getByText('6 / 10')).toBeInTheDocument();
  });

  it('어빌리티 이름과 설명 표시 (루나 성흔)', () => {
    render(
      <StatusPanel
        character={makeCharacter()}
        runIndex={1}
        canReroll={false}
        onUseItem={vi.fn()}
        onReroll={vi.fn()}
      />,
    );
    expect(screen.getByText('루나 성흔')).toBeInTheDocument();
  });

  it('회차 (runIndex) 표시', () => {
    render(
      <StatusPanel
        character={makeCharacter()}
        runIndex={3}
        canReroll={false}
        onUseItem={vi.fn()}
        onReroll={vi.fn()}
      />,
    );
    expect(screen.getByText(/3회차/)).toBeInTheDocument();
  });

  it('인벤토리 항목 표시 (medical_bandage, ether_refined_water)', () => {
    render(
      <StatusPanel
        character={makeCharacter()}
        runIndex={1}
        canReroll={false}
        onUseItem={vi.fn()}
        onReroll={vi.fn()}
      />,
    );
    // 한국어 라벨 (의료용 붕대, 에테르 정제수)
    expect(screen.getByText(/의료용 붕대/)).toBeInTheDocument();
    expect(screen.getByText(/에테르 정제수/)).toBeInTheDocument();
  });

  it('인벤토리 비어있으면 "비어 있음" 표시', () => {
    render(
      <StatusPanel
        character={makeCharacter({ inventory: [] })}
        runIndex={1}
        canReroll={false}
        onUseItem={vi.fn()}
        onReroll={vi.fn()}
      />,
    );
    expect(screen.getByText(/비어 있음/)).toBeInTheDocument();
  });

  it('canReroll=true + rerollsLeft>0 → 재굴림 버튼 노출 + 클릭 시 onReroll', () => {
    const onReroll = vi.fn();
    render(
      <StatusPanel
        character={makeCharacter()}
        runIndex={1}
        canReroll={true}
        onUseItem={vi.fn()}
        onReroll={onReroll}
      />,
    );
    const btn = screen.getByRole('button', { name: /재굴림|다시 굴리기/ });
    fireEvent.click(btn);
    expect(onReroll).toHaveBeenCalledTimes(1);
  });

  it('canReroll=false → 재굴림 버튼 안 보임', () => {
    render(
      <StatusPanel
        character={makeCharacter()}
        runIndex={1}
        canReroll={false}
        onUseItem={vi.fn()}
        onReroll={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /재굴림|다시 굴리기/ })).toBeNull();
  });

  // #259 — 성흔 침식 시각화.
  it('침식도 0-49 — 정상 표시 (경고 없음)', () => {
    render(
      <StatusPanel
        character={makeCharacter({ stigmaErosion: 30 })}
        runIndex={1}
        canReroll={false}
        onUseItem={vi.fn()}
        onReroll={vi.fn()}
      />,
    );
    expect(screen.getByTestId('stigma-bar')).toHaveAttribute('data-level', 'normal');
    expect(screen.getByText('30 / 100')).toBeInTheDocument();
  });

  it('침식도 50-79 — 디버프 단계 표시', () => {
    render(
      <StatusPanel
        character={makeCharacter({ stigmaErosion: 65 })}
        runIndex={1}
        canReroll={false}
        onUseItem={vi.fn()}
        onReroll={vi.fn()}
      />,
    );
    expect(screen.getByTestId('stigma-bar')).toHaveAttribute('data-level', 'debuff');
    expect(screen.getByText(/손끝이 딱딱하게 굳어갑니다/)).toBeInTheDocument();
  });

  it('침식도 80+ — 임계 단계 경고 + 푸른 결정 이펙트', () => {
    render(
      <StatusPanel
        character={makeCharacter({ stigmaErosion: 88 })}
        runIndex={1}
        canReroll={false}
        onUseItem={vi.fn()}
        onReroll={vi.fn()}
      />,
    );
    expect(screen.getByTestId('stigma-bar')).toHaveAttribute('data-level', 'critical');
    expect(screen.getByText(/체온이 느껴지지 않습니다/)).toBeInTheDocument();
  });

  it('consumable 아이템에 "사용" 버튼 + 클릭 시 onUseItem(itemId)', () => {
    const onUseItem = vi.fn();
    render(
      <StatusPanel
        character={makeCharacter({ inventory: ['medical_bandage'] })}
        runIndex={1}
        canReroll={false}
        onUseItem={onUseItem}
        onReroll={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: '사용' });
    fireEvent.click(btn);
    expect(onUseItem).toHaveBeenCalledWith('medical_bandage');
  });
});
