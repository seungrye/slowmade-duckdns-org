// WebAdventureCard — 사이트 홈 카드 (#246).
// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import WebAdventureCard from './web-adventure-card';

describe('WebAdventureCard', () => {
  it('제목 + 설명 + 플레이 링크 렌더', () => {
    render(<WebAdventureCard />);
    expect(screen.getByText(/에테르니아의 추락/)).toBeInTheDocument();
    expect(screen.getByText(/다크 에픽|CYOA|모험|마법공학/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /지금 플레이|모험 시작|시작/ });
    expect(link).toHaveAttribute('href', '/games/web-adventure/play');
  });

  it('갤러리 보조 링크 (선택적)', () => {
    render(<WebAdventureCard />);
    const galleryLink = screen.queryByRole('link', { name: /갤러리|엔딩/ });
    if (galleryLink) {
      expect(galleryLink).toHaveAttribute('href', '/games/web-adventure/gallery');
    }
  });
});
