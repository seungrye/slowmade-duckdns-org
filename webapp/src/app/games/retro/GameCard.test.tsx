// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GameCard from './GameCard';
import { builtinEntry, romEntry, type UserRomDto } from '@/lib/retro/entry';

const WITH_COVER = builtinEntry({
  slug: 'nomolos', title: 'Nomolos', platform: 'snes', file: 'nomolos.sfc',
  cover: 'nomolos.png', source: 'https://x.test', license: '홈브류',
});
const NO_COVER = builtinEntry({
  slug: 'anguna', title: 'Anguna', platform: 'cps2', file: 'anguna.zip',
  source: 'https://x.test', license: '홈브류',
});

const ROM_BASE: UserRomDto = {
  id: '653f1a2b3c4d5e6f70819202', title: '내 롬', platform: 'cps2',
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
    expect(screen.getByText('CPS2')).toBeInTheDocument();
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
      const row = screen.getByText('CPS2').parentElement!;
      expect(row.className).toContain('left-2');
      expect(row).toContainElement(screen.getByLabelText('저장된 상태 있음'));
    });

    // #120 — 뜻이 다르니 배지는 따로. 다만 높이가 어긋나면 지저분하다.
    it('기종 배지와 **높이가 같다** — 글자와 아이콘은 줄 높이가 달라 고정해야 맞는다', () => {
      render(<GameCard game={rom({ hasSave: true })} />);
      const platform = screen.getByText('CPS2');
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

    // #127 — 감추는 대신 비활성. 패치를 올려도 버튼 위치가 밀리지 않는다.
    it('패치가 없으면 체크박스가 자리는 지키되 비활성이다', () => {
      render(<GameCard game={rom()} {...handlers()} />);
      expect(screen.getByRole('button', { name: '내 롬 패치 올리기' })).toBeInTheDocument();
      const box = screen.getByRole('checkbox');
      expect(box).toBeDisabled();
      expect(box).not.toBeChecked();
    });

    // #122 — 파일명을 늘 보여 줄 이유는 없다. 다만 #125 — 아이콘만 두면 무슨 버튼인지 모른다.
    it('긴 파일명 대신 **형식**을 적는다', () => {
      render(<GameCard game={rom({ patch: PATCH, patchEnabled: true })} {...handlers()} />);
      expect(screen.queryByText('한글패치.ips')).not.toBeInTheDocument();
      expect(screen.getByText('IPS')).toBeInTheDocument();
      // 전체 이름은 툴팁에 남는다.
      expect(screen.getByRole('button', { name: '내 롬 패치 교체' }).getAttribute('title'))
        .toContain('한글패치.ips');
    });

    it.each([
      ['bps', 'BPS'],
      ['ups', 'UPS'],
    ])('%s 패치는 %s 로 적는다', (format, label) => {
      render(<GameCard game={rom({ patch: { ...PATCH, format } })} {...handlers()} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });

    it('패치가 없으면 "패치" 라고 적어 무엇을 올리는 자리인지 알린다', () => {
      render(<GameCard game={rom()} {...handlers()} />);
      expect(screen.getByText('패치')).toBeInTheDocument();
    });

    it('패치가 있으면 체크박스를 쓸 수 있다', () => {
      render(<GameCard game={rom({ patch: PATCH, patchEnabled: true })} {...handlers()} />);
      const box = screen.getByRole('checkbox');
      expect(box).toBeEnabled();
      expect(box).toBeChecked();
    });

    // #127 — w-6 이 글자 있는 버튼까지 24px 로 묶어 오른쪽이 잘렸다.
    it('글자가 있는 버튼은 너비를 고정하지 않는다 — 글자가 넘쳐 여백이 사라진다', () => {
      render(<GameCard game={rom({ patch: PATCH })} {...handlers()} />);
      const cls = screen.getByRole('button', { name: '내 롬 패치 교체' }).className;
      expect(cls).not.toMatch(/\bw-6\b/);
      expect(cls).toMatch(/\bpx-1\.5\b/);
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

    // #127 — 그림 아이콘은 그 자체로 뜻이 통한다. 글자는 패치 버튼에만.
    it('글자 없이 아이콘만 둔다', () => {
      render(<GameCard game={rom()} onCoverUpload={vi.fn()} />);
      expect(screen.queryByText('그림')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '내 롬 카드 그림' }).className).toMatch(/\bw-6\b/);
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

  // #125 — 실제로 버튼을 눌렀을 때 파일 선택창이 열리는가.
  // 지금까지는 숨은 input 에 change 를 쏴서 검증해 **버튼 클릭 경로를 한 번도 안 봤다.**
  describe('버튼이 파일 선택을 연다', () => {
    /**
     * `input.click()` 을 진짜와 같게 흉내 낸다 — **버블링되고 취소 가능한** 클릭.
     * 위에서 누가 preventDefault 하면 브라우저는 파일 선택창을 열지 않는다.
     * 단순히 `click` 이 불렸는지만 보면 이 사고를 놓친다(실제로 놓쳤다).
     */
    function pickerOpens(buttonName: string, inputLabel: string): boolean {
      const input = screen.getByLabelText(inputLabel) as HTMLInputElement;
      let opened = false;
      vi.spyOn(input, 'click').mockImplementation(() => {
        const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
        opened = input.dispatchEvent(ev); // preventDefault 되면 false
      });
      fireEvent.click(screen.getByRole('button', { name: buttonName }));
      return opened;
    }

    it('패치 버튼을 누르면 파일 선택창이 열린다', () => {
      render(<GameCard game={rom()} onPatchUpload={vi.fn()} onCoverUpload={vi.fn()} />);
      expect(pickerOpens('내 롬 패치 올리기', '내 롬 패치 파일')).toBe(true);
    });

    it('커버 버튼을 누르면 파일 선택창이 열린다', () => {
      render(<GameCard game={rom()} onPatchUpload={vi.fn()} onCoverUpload={vi.fn()} />);
      expect(pickerOpens('내 롬 카드 그림', '내 롬 커버 이미지')).toBe(true);
    });
  });

  // #145 — 안드로이드는 확장자 accept 를 MIME 으로 못 바꿔 제한된 선택기로 떨어진다.
  describe('모바일 파일 선택 (#145)', () => {
    it('패치 입력에 확장자 accept 를 걸지 않는다', () => {
      render(<GameCard game={rom()} onPatchUpload={vi.fn()} onCoverUpload={vi.fn()} />);
      const input = screen.getByLabelText('내 롬 패치 파일');
      expect(input.getAttribute('accept')).toBeNull();
    });

    it('커버는 MIME 이라 그대로 둔다 — 모바일에서도 잘 동작한다', () => {
      render(<GameCard game={rom()} onCoverUpload={vi.fn()} />);
      expect(screen.getByLabelText('내 롬 커버 이미지').getAttribute('accept')).toContain('image/');
    });
  });
});
