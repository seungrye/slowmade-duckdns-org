// EndingScreen 의 갤러리 진입 링크 검증 (#239/#244 후속).
//
// 의심: 사용자가 엔딩 도달 후 갤러리에 가려면 *어디로 클릭* 해야 하는가?
//   - play page 의 MobileDrawer 안 '🏆 엔딩 갤러리' 링크는 playing phase 에만 마운트.
//   - ended phase 진입 시 drawer 자체 안 보임 → EndingScreen 에 갤러리 링크 필요.
//   - 현재 EndingScreen 에 그 링크 없음 → RED.
//
// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import EndingScreen from './EndingScreen';
import type { Character } from '@/types/web-adventure';

function makeCharacter(): Character {
  return {
    stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
    hp: 8,
    maxHp: 10,
    ability: 'scholar',
    inventory: [],
    flags: {},
    rerollsLeft: 2,
  };
}

describe('EndingScreen — 갤러리 진입 링크 (이슈 검토)', () => {
  it('엔딩 갤러리 페이지로 이동하는 링크가 있다 (/games/web-adventure/gallery)', () => {
    render(
      <EndingScreen
        endingId="main"
        character={makeCharacter()}
        log={['로그 1']}
        onRestart={vi.fn()}
      />,
    );
    const link = screen.getByRole('link', { name: /갤러리|엔딩.*보기/ });
    expect(link).toHaveAttribute('href', '/games/web-adventure/gallery');
  });
});
