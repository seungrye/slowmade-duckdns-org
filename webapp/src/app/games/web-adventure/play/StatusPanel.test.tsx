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
        onUseItem={vi.fn()}
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
        onUseItem={vi.fn()}
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
        onUseItem={vi.fn()}
      />,
    );
    expect(screen.getByText('루나 성흔')).toBeInTheDocument();
  });

  it('회차 (runIndex) 표시', () => {
    render(
      <StatusPanel
        character={makeCharacter()}
        runIndex={3}
        onUseItem={vi.fn()}
      />,
    );
    expect(screen.getByText(/3회차/)).toBeInTheDocument();
  });

  it('인벤토리 항목 표시 (medical_bandage, ether_refined_water)', () => {
    render(
      <StatusPanel
        character={makeCharacter()}
        runIndex={1}
        onUseItem={vi.fn()}
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
        onUseItem={vi.fn()}
      />,
    );
    expect(screen.getByText(/비어 있음/)).toBeInTheDocument();
  });

  it('재굴림 잔여 횟수 표시 + 버튼 없음 (버튼은 판정 결과 화면으로 이동)', () => {
    render(
      <StatusPanel character={makeCharacter()} runIndex={1} onUseItem={vi.fn()} />,
    );
    expect(screen.getByText('재굴림')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /재굴림|다시 굴리기/ })).toBeNull();
  });

  // 성흔 침식 시각화 — stigma-sense 단일 출처(5단계·신체+심리) (#397).
  const renderStigma = (stigmaErosion: number) => render(
    <StatusPanel character={makeCharacter({ stigmaErosion })} runIndex={1} onUseItem={vi.fn()} />,
  );

  it('침식 tier 0(성한 몸) — 감각 캡션 없음', () => {
    renderStigma(10);
    expect(screen.getByTestId('stigma-bar')).toHaveAttribute('data-tier', '0');
    expect(screen.queryByTestId('stigma-sense')).toBeNull();
    expect(screen.getByText('10 / 100')).toBeInTheDocument();
  });

  it('침식이 오르면 신체 감각(손)이 늘 보인다 — 수치가 아니라 몸으로', () => {
    renderStigma(60); // tier 2
    expect(screen.getByTestId('stigma-bar')).toHaveAttribute('data-tier', '2');
    // stigma-sense 의 손 감각(tier2): "손가락 두 개가 제 뜻대로 접히지 않는다."
    expect(screen.getByText(/손가락 두 개가 제 뜻대로/)).toBeInTheDocument();
  });

  it('높은 침식(tier≥3)은 심리 감각(마음)까지 함께 — 신체+심리', () => {
    renderStigma(90); // tier 3
    expect(screen.getByTestId('stigma-bar')).toHaveAttribute('data-tier', '3');
    const sense = screen.getByTestId('stigma-sense');
    expect(sense.textContent).toMatch(/살갗 아래에서 유리 갈리는 소리/); // 손 tier3
    expect(sense.textContent).toMatch(/결정이 너를 대신해/); // 마음 tier3
  });

  it('침식 100(tier 4) — 최종 단계 감각', () => {
    renderStigma(100);
    expect(screen.getByTestId('stigma-bar')).toHaveAttribute('data-tier', '4');
    expect(screen.getByText(/손등으로 밀어야/)).toBeInTheDocument();
  });

  it('consumable 아이템에 "사용" 버튼 + 클릭 시 onUseItem(itemId)', () => {
    const onUseItem = vi.fn();
    render(
      <StatusPanel
        character={makeCharacter({ inventory: ['medical_bandage'] })}
        runIndex={1}
        onUseItem={onUseItem}
      />,
    );
    const btn = screen.getByRole('button', { name: '사용' });
    fireEvent.click(btn);
    expect(onUseItem).toHaveBeenCalledWith('medical_bandage');
  });
});
