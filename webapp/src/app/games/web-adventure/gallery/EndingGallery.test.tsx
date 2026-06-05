// EndingGallery — #244. 6 엔딩 카드 + 도달/미도달 + 카운트.
// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EndingGallery from './EndingGallery';

const noRuns: Array<{ endingId: string }> = [];
const someRuns = [
  { endingId: 'ascension' },
  { endingId: 'ascension' },
  { endingId: 'revolution' },
  { endingId: 'fall' },
];

describe('EndingGallery', () => {
  it('6 엔딩 카드 모두 렌더 (도달 X 면 마스킹 ???)', () => {
    render(<EndingGallery pastRuns={noRuns} />);
    const cards = screen.getAllByTestId(/^ending-card-/);
    expect(cards).toHaveLength(6);
    // 모두 미도달 — ??? 마스킹 (8개 중 6개의 마스크 표시)
    expect(screen.getAllByText('???').length).toBe(6);
  });

  it('도달한 엔딩만 제목 + epilogue 노출 + 도달 카운트', () => {
    render(<EndingGallery pastRuns={someRuns} />);
    // ascension 2 회
    const ascensionCard = screen.getByTestId('ending-card-ascension');
    expect(ascensionCard).toHaveTextContent('승천');
    expect(ascensionCard).toHaveTextContent(/2\s*회/);
    // revolution / fall 1 회씩
    expect(screen.getByTestId('ending-card-revolution')).toHaveTextContent(/1\s*회/);
    expect(screen.getByTestId('ending-card-fall')).toHaveTextContent(/1\s*회/);
    // 미도달 (harmony / petrification / sylvan_bond) — ???
    expect(screen.getByTestId('ending-card-harmony')).toHaveTextContent('???');
  });

  it('전체 도달률 (n/6) 표시', () => {
    render(<EndingGallery pastRuns={someRuns} />);
    // someRuns 의 unique endingId = {ascension, revolution, fall} = 3 종
    expect(screen.getByTestId('gallery-progress')).toHaveTextContent('3 / 6');
  });

  it('빈 past_runs → 0/6', () => {
    render(<EndingGallery pastRuns={noRuns} />);
    expect(screen.getByTestId('gallery-progress')).toHaveTextContent('0 / 6');
  });
});
