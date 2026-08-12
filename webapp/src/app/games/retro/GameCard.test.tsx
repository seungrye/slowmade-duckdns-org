// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GameCard from './GameCard';
import { builtinEntry, romEntry, type UserRomDto } from '@/lib/retro/entry';

const WITH_COVER = builtinEntry({
  slug: 'nomolos', title: 'Nomolos', platform: 'nes', file: 'nomolos.nes',
  cover: 'nomolos.png', source: 'https://x.test', license: '홈브류',
});
const NO_COVER = builtinEntry({
  slug: 'anguna', title: 'Anguna', platform: 'gba', file: 'anguna.gba',
  source: 'https://x.test', license: '홈브류',
});

const ROM_BASE: UserRomDto = {
  id: '653f1a2b3c4d5e6f70819202', title: '내 롬', platform: 'md',
  size: 2 * 1024 * 1024, createdAt: '2026-08-12T00:00:00.000Z',
};
const rom = (over: Partial<UserRomDto> = {}) => romEntry({ ...ROM_BASE, ...over });

const PATCH = { id: 'p1', name: '한글패치.ips', format: 'ips', size: 4096 };

describe('GameCard', () => {
  describe('커버', () => {
    it('있으면 이미지를 그린다', () => {
      render(<GameCard game={WITH_COVER} />);
      expect(document.querySelector('img')?.getAttribute('src')).toBe('/games/retro/covers/nomolos.png');
    });

    it('없으면 제목 첫 글자 타일로 대신한다 — 빈 사각형보다 낫다', () => {
      render(<GameCard game={NO_COVER} />);
      expect(document.querySelector('img')).toBeNull();
      expect(screen.getByText('A')).toBeInTheDocument();
    });
  });

  it('기종 배지와 부제를 보여 준다', () => {
    render(<GameCard game={rom()} />);
    expect(screen.getByText('MD')).toBeInTheDocument();
    expect(screen.getByText('2.0 MB')).toBeInTheDocument();
  });

  it('플레이 화면으로 링크한다', () => {
    render(<GameCard game={rom()} />);
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/games/retro/play/rom/653f1a2b3c4d5e6f70819202',
    );
  });

  describe('세이브 점', () => {
    it('세이브가 있으면 표시한다', () => {
      render(<GameCard game={rom({ hasSave: true })} />);
      expect(screen.getByLabelText('저장된 상태 있음')).toBeInTheDocument();
    });

    it('없으면 아무것도 없다', () => {
      render(<GameCard game={rom()} />);
      expect(screen.queryByLabelText('저장된 상태 있음')).not.toBeInTheDocument();
    });
  });

  describe('패치 칩', () => {
    const handlers = () => ({ onPatchUpload: vi.fn(), onPatchToggle: vi.fn() });

    it('기본 제공 게임에는 나오지 않는다 — 패치 대상이 아니다', () => {
      render(<GameCard game={WITH_COVER} {...handlers()} />);
      expect(screen.queryByText('+ 패치')).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('패치가 없으면 "+ 패치" 를 보여 준다', () => {
      render(<GameCard game={rom()} {...handlers()} />);
      expect(screen.getByText('+ 패치')).toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('패치가 있으면 이름과 체크박스를 보여 준다', () => {
      render(<GameCard game={rom({ patch: PATCH, patchEnabled: true })} {...handlers()} />);
      expect(screen.getByText('한글패치.ips')).toBeInTheDocument();
      expect(screen.getByRole('checkbox')).toBeChecked();
    });

    it('적용이 꺼져 있으면 체크가 풀려 있다', () => {
      render(<GameCard game={rom({ patch: PATCH, patchEnabled: false })} {...handlers()} />);
      expect(screen.getByRole('checkbox')).not.toBeChecked();
    });

    it('체크를 바꾸면 알린다', () => {
      const h = handlers();
      const game = rom({ patch: PATCH, patchEnabled: true });
      render(<GameCard game={game} {...h} />);
      fireEvent.click(screen.getByRole('checkbox'));
      expect(h.onPatchToggle).toHaveBeenCalledWith(game, false);
    });

    it('파일을 고르면 알린다', () => {
      const h = handlers();
      const game = rom();
      render(<GameCard game={game} {...h} />);
      const file = new File([new Uint8Array(8)], 'ko.ips');
      fireEvent.change(screen.getByLabelText('내 롬 패치 파일'), { target: { files: [file] } });
      expect(h.onPatchUpload).toHaveBeenCalledWith(game, file);
    });

    // 카드 전체가 플레이 링크라, 여기서 새면 패치를 만지려다 게임이 뜬다.
    it('칩을 눌러도 플레이 링크로 새지 않는다', () => {
      const h = handlers();
      render(<GameCard game={rom({ patch: PATCH })} {...h} />);

      const clickInside = (el: Element) => {
        const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
        el.dispatchEvent(ev);
        return ev.defaultPrevented;
      };
      // 칩 컨테이너에서 발생한 클릭은 삼켜진다.
      expect(clickInside(screen.getByText('한글패치.ips'))).toBe(true);
      expect(clickInside(screen.getByRole('checkbox'))).toBe(true);
    });

    it('busy 면 조작을 잠근다 — 두 번 눌려 중복 요청이 나가지 않게', () => {
      render(<GameCard game={rom({ patch: PATCH })} {...handlers()} busy />);
      expect(screen.getByRole('checkbox')).toBeDisabled();
    });
  });

  describe('삭제', () => {
    it('onDelete 를 안 주면 버튼이 없다', () => {
      render(<GameCard game={WITH_COVER} />);
      expect(screen.queryByRole('button', { name: /삭제/ })).toBeNull();
    });

    it('누르면 그 항목을 넘기고, 플레이 링크로 새지 않는다', () => {
      const onDelete = vi.fn();
      const game = rom();
      render(<GameCard game={game} onDelete={onDelete} />);

      const btn = screen.getByRole('button', { name: '내 롬 삭제' });
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
      btn.dispatchEvent(ev);

      expect(onDelete).toHaveBeenCalledWith(game);
      expect(ev.defaultPrevented).toBe(true);
    });

    it('세이브 점이 있으면 겹치지 않게 왼쪽으로 비킨다', () => {
      const { rerender } = render(<GameCard game={rom()} onDelete={vi.fn()} />);
      expect(screen.getByRole('button', { name: '내 롬 삭제' }).className).toContain('right-2');

      rerender(<GameCard game={rom({ hasSave: true })} onDelete={vi.fn()} />);
      expect(screen.getByRole('button', { name: '내 롬 삭제' }).className).toContain('right-7');
    });
  });
});
