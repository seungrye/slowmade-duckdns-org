// Verifying EndingScreen's gallery entry link (following #239/#244).
//
// The suspicion: after reaching an ending, *where does the user click* to get to the gallery?
//   - the 'ending gallery' link inside the play page's MobileDrawer mounts only in the playing phase.
//   - entering the ended phase hides the drawer itself -> EndingScreen needs a gallery link.
//   - EndingScreen currently has no such link -> RED.
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
    ability: 'lunar',
    protagonist: 'kael',
    stigmaErosion: 0,
    inventory: [],
    flags: {},
    rerollsLeft: 2,
  };
}

describe('EndingScreen — 갤러리 진입 링크 (이슈 검토)', () => {
  it('엔딩 갤러리 페이지로 이동하는 링크가 있다 (/games/web-adventure/gallery)', () => {
    render(
      <EndingScreen
        endingId="ascension"
        character={makeCharacter()}
        log={['로그 1']}
        onRestart={vi.fn()}
      />,
    );
    const link = screen.getByRole('link', { name: /갤러리|엔딩.*보기/ });
    expect(link).toHaveAttribute('href', '/games/web-adventure/gallery');
  });
});
