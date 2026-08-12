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

/** 카드 위 조작이 플레이 링크로 새지 않는지 — 클릭이 삼켜졌는가. */
function clickInside(el: Element) {
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev.defaultPrevented;
}

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

  describe('세이브 표시 (#118)', () => {
    it('세이브가 있으면 디스켓 아이콘을 보여 준다', () => {
      render(<GameCard game={rom({ hasSave: true })} />);
      const icon = screen.getByLabelText('저장된 상태 있음');
      expect(icon).toBeInTheDocument();
      // 점이 아니라 아이콘이다.
      expect(icon.tagName.toLowerCase()).toBe('svg');
    });

    it('기종 배지 옆(좌상단)에 나란히 놓인다', () => {
      render(<GameCard game={rom({ hasSave: true })} />);
      const row = screen.getByText('MD').parentElement!;
      expect(row.className).toContain('left-2');
      expect(row).toContainElement(screen.getByLabelText('저장된 상태 있음'));
    });

    // #120 — 뜻이 다르니 배지는 따로. 다만 높이가 어긋나면 지저분하다.
    it('기종 배지와 **높이가 같다** — 글자와 아이콘은 줄 높이가 달라 고정해야 맞는다', () => {
      render(<GameCard game={rom({ hasSave: true })} />);
      const platform = screen.getByText('MD');
      const saveBadge = screen.getByLabelText('저장된 상태 있음').parentElement!;

      const heightOf = (el: Element) =>
        (el.getAttribute('class') ?? '').split(/\s+/).find((c) => /^h-\[/.test(c));

      expect(heightOf(platform)).toBeDefined();
      expect(heightOf(saveBadge)).toBe(heightOf(platform));
    });

    it('없으면 아무것도 없다', () => {
      render(<GameCard game={rom()} />);
      expect(screen.queryByLabelText('저장된 상태 있음')).not.toBeInTheDocument();
    });
  });

  describe('패치 버튼', () => {
    const handlers = () => ({ onPatchUpload: vi.fn(), onPatchToggle: vi.fn() });

    it('기본 제공 게임에는 나오지 않는다 — 패치 대상이 아니다', () => {
      render(<GameCard game={WITH_COVER} {...handlers()} />);
      expect(screen.queryByRole('button', { name: /패치/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('패치가 없으면 버튼만, 체크박스는 없다 — 켤 게 없다', () => {
      render(<GameCard game={rom()} {...handlers()} />);
      expect(screen.getByRole('button', { name: '내 롬 패치 올리기' })).toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    // #122 — 파일명을 늘 보여 줄 이유가 없다. 카드가 좁다.
    it('파일명을 화면에 적지 않는다 — 툴팁으로만 알려 준다', () => {
      render(<GameCard game={rom({ patch: PATCH, patchEnabled: true })} {...handlers()} />);
      expect(screen.queryByText('한글패치.ips')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '내 롬 패치 교체' }).getAttribute('title'))
        .toContain('한글패치.ips');
    });

    it('패치가 있으면 체크박스가 생긴다', () => {
      render(<GameCard game={rom({ patch: PATCH, patchEnabled: true })} {...handlers()} />);
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
    it('버튼을 눌러도 플레이 링크로 새지 않는다', () => {
      const h = handlers();
      render(<GameCard game={rom({ patch: PATCH })} {...h} />);
      expect(clickInside(screen.getByRole('button', { name: '내 롬 패치 교체' }))).toBe(true);
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

      expect(clickInside(screen.getByRole('button', { name: '내 롬 삭제' }))).toBe(true);
      expect(onDelete).toHaveBeenCalledWith(game);
    });

    // #118 — 세이브 표시가 좌상단으로 옮겨 가 우상단이 비었다. 자리를 비킬 일이 없다.
    it('세이브 유무와 관계없이 우상단에 그대로 있다', () => {
      const { rerender } = render(<GameCard game={rom()} onDelete={vi.fn()} />);
      expect(screen.getByRole('button', { name: '내 롬 삭제' }).className).toContain('right-2');

      rerender(<GameCard game={rom({ hasSave: true })} onDelete={vi.fn()} />);
      expect(screen.getByRole('button', { name: '내 롬 삭제' }).className).toContain('right-2');
    });
  });

  // #122 — 카드 그림과 제목을 직접 고친다.
  describe('커버 그림', () => {
    it('기본 제공 게임에는 버튼이 없다', () => {
      render(<GameCard game={WITH_COVER} onCoverUpload={vi.fn()} />);
      expect(screen.queryByRole('button', { name: /카드 그림/ })).not.toBeInTheDocument();
    });

    it('파일을 고르면 알린다', () => {
      const onCoverUpload = vi.fn();
      const game = rom();
      render(<GameCard game={game} onCoverUpload={onCoverUpload} />);

      const file = new File([new Uint8Array(8)], 'cover.png', { type: 'image/png' });
      fireEvent.change(screen.getByLabelText('내 롬 커버 이미지'), { target: { files: [file] } });
      expect(onCoverUpload).toHaveBeenCalledWith(game, file);
    });

    it('커버가 있으면 타일 대신 그림을 그린다', () => {
      render(<GameCard game={rom({ coverUrl: '/api/games/retro/roms/1/cover' })} onCoverUpload={vi.fn()} />);
      expect(document.querySelector('img')?.getAttribute('src')).toBe('/api/games/retro/roms/1/cover');
      expect(screen.queryByText('내')).not.toBeInTheDocument();
    });

    it('눌러도 플레이 링크로 새지 않는다', () => {
      render(<GameCard game={rom()} onCoverUpload={vi.fn()} />);
      expect(clickInside(screen.getByRole('button', { name: '내 롬 카드 그림' }))).toBe(true);
    });
  });

  describe('제목 고치기', () => {
    const startEdit = () => fireEvent.click(screen.getByRole('button', { name: '내 롬 이름 바꾸기' }));

    it('기본 제공 게임에는 연필이 없다', () => {
      render(<GameCard game={WITH_COVER} onRename={vi.fn()} />);
      expect(screen.queryByRole('button', { name: /이름 바꾸기/ })).not.toBeInTheDocument();
    });

    it('연필을 누르면 입력이 되고, Enter 로 저장한다', () => {
      const onRename = vi.fn();
      const game = rom();
      render(<GameCard game={game} onRename={onRename} />);

      startEdit();
      const input = screen.getByLabelText('제목');
      fireEvent.change(input, { target: { value: '젤다의 전설' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onRename).toHaveBeenCalledWith(game, '젤다의 전설');
    });

    it('Esc 로 취소하면 저장하지 않는다', () => {
      const onRename = vi.fn();
      render(<GameCard game={rom()} onRename={onRename} />);

      startEdit();
      const input = screen.getByLabelText('제목');
      fireEvent.change(input, { target: { value: '바뀐 이름' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(onRename).not.toHaveBeenCalled();
      expect(screen.getByText('내 롬')).toBeInTheDocument();
    });

    it('빈 이름은 저장하지 않는다 — 이름 없는 카드를 만들지 않는다', () => {
      const onRename = vi.fn();
      render(<GameCard game={rom()} onRename={onRename} />);

      startEdit();
      const input = screen.getByLabelText('제목');
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onRename).not.toHaveBeenCalled();
    });

    it('그대로면 저장하지 않는다 — 헛된 요청을 보내지 않는다', () => {
      const onRename = vi.fn();
      render(<GameCard game={rom()} onRename={onRename} />);

      startEdit();
      fireEvent.keyDown(screen.getByLabelText('제목'), { key: 'Enter' });
      expect(onRename).not.toHaveBeenCalled();
    });

    it('연필과 입력 모두 플레이 링크로 새지 않는다', () => {
      render(<GameCard game={rom()} onRename={vi.fn()} />);
      // fireEvent 는 preventDefault 되면 false 를 돌려준다. 이걸 써야 편집 진입이 함께 반영된다.
      expect(fireEvent.click(screen.getByRole('button', { name: '내 롬 이름 바꾸기' }))).toBe(false);
      expect(fireEvent.click(screen.getByLabelText('제목'))).toBe(false);
    });
  });
});
