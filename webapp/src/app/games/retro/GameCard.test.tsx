// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GameCard from './GameCard';
import { builtinEntry, romEntry } from '@/lib/retro/entry';

const WITH_COVER = builtinEntry({
  slug: 'nomolos', title: 'Nomolos', platform: 'nes', file: 'nomolos.nes',
  cover: 'nomolos.png', source: 'https://x.test', license: '홈브류',
});
const NO_COVER = builtinEntry({
  slug: 'anguna', title: 'Anguna', platform: 'gba', file: 'anguna.gba',
  source: 'https://x.test', license: '홈브류',
});
const MY_ROM = romEntry({
  id: '653f1a2b3c4d5e6f70819202', title: '내 롬', platform: 'md',
  size: 2 * 1024 * 1024, createdAt: '2026-08-12T00:00:00.000Z',
});

describe('GameCard', () => {
  it('커버가 있으면 이미지를 그린다', () => {
    render(<GameCard game={WITH_COVER} />);
    expect(document.querySelector('img')?.getAttribute('src')).toBe('/games/retro/covers/nomolos.png');
  });

  it('커버가 없으면 제목 첫 글자 타일로 대신한다 — 빈 사각형보다 낫다', () => {
    render(<GameCard game={NO_COVER} />);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('기종 배지와 부제를 보여 준다', () => {
    render(<GameCard game={MY_ROM} />);
    expect(screen.getByText('MD')).toBeInTheDocument();
    expect(screen.getByText('2.0 MB')).toBeInTheDocument();
  });

  it('플레이 화면으로 링크한다', () => {
    render(<GameCard game={MY_ROM} />);
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/games/retro/play/rom/653f1a2b3c4d5e6f70819202',
    );
  });

  it('onDelete 를 안 주면 삭제 버튼이 없다', () => {
    render(<GameCard game={WITH_COVER} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('onDelete 를 주면 삭제 버튼이 그 항목을 넘긴다', () => {
    const onDelete = vi.fn();
    render(<GameCard game={MY_ROM} onDelete={onDelete} />);
    screen.getByRole('button', { name: '내 롬 삭제' }).click();
    expect(onDelete).toHaveBeenCalledWith(MY_ROM);
  });

  it('삭제 중에는 버튼을 잠근다 — 두 번 눌려 중복 요청이 나가지 않게', () => {
    render(<GameCard game={MY_ROM} onDelete={vi.fn()} deleting />);
    expect(screen.getByRole('button', { name: '내 롬 삭제' })).toBeDisabled();
  });
});
