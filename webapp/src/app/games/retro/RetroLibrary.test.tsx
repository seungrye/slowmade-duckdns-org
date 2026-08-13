// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import RetroLibrary from './RetroLibrary';
import type { BuiltinGame, UserRomDto } from '@/lib/retro/entry';

const BUILTINS: BuiltinGame[] = [
  { slug: 'nomolos', title: 'Nomolos', platform: 'snes', file: 'nomolos.sfc', source: 'https://x.test', license: '홈브류' },
  { slug: 'anguna', title: 'Anguna', platform: 'arcade', file: 'anguna.zip', source: 'https://x.test', license: '홈브류' },
];

const MY_ROMS: UserRomDto[] = [
  { id: '653f1a2b3c4d5e6f70819202', title: '내가 올린 롬', platform: 'arcade', size: 2 * 1024 * 1024, createdAt: '2026-08-12T00:00:00.000Z' },
];

/** 사이드바·칩이 둘 다 렌더되므로(CSS 로만 감춤) 사이드바 쪽 버튼을 집어 쓴다. */
function sidebarButton(label: string) {
  return within(screen.getByRole('navigation', { name: '기종' })).getByRole('button', { name: new RegExp(`^${label}`) });
}

describe('RetroLibrary', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('올린 롬과 기본 제공 게임을 한 목록에 보여 준다', () => {
    render(<RetroLibrary builtins={BUILTINS} initialRoms={MY_ROMS} />);
    expect(screen.getByText('Nomolos')).toBeInTheDocument();
    expect(screen.getByText('Anguna')).toBeInTheDocument();
    expect(screen.getByText('내가 올린 롬')).toBeInTheDocument();
  });

  it('내가 올린 롬이 앞에 온다 — 방금 올린 것이 바로 보여야 한다', () => {
    render(<RetroLibrary builtins={BUILTINS} initialRoms={MY_ROMS} />);
    const grid = screen.getByRole('list', { name: '게임 목록' });
    const titles = within(grid).getAllByRole('listitem').map((li) => li.textContent);
    expect(titles[0]).toContain('내가 올린 롬');
  });

  it('기종을 고르면 그 기종만 남는다', () => {
    render(<RetroLibrary builtins={BUILTINS} initialRoms={MY_ROMS} />);
    fireEvent.click(sidebarButton('SNES'));
    expect(screen.getByText('Nomolos')).toBeInTheDocument();
    expect(screen.queryByText('Anguna')).not.toBeInTheDocument();
    expect(screen.queryByText('내가 올린 롬')).not.toBeInTheDocument();
  });

  it('사이드바 배지가 기종별 개수를 보여 준다', () => {
    render(<RetroLibrary builtins={BUILTINS} initialRoms={MY_ROMS} />);
    expect(sidebarButton('전체')).toHaveTextContent('3');
    expect(sidebarButton('SNES')).toHaveTextContent('1');
    expect(sidebarButton('FBNeo')).toHaveTextContent('2');
  });

  it('검색으로 거른다', () => {
    render(<RetroLibrary builtins={BUILTINS} initialRoms={MY_ROMS} />);
    fireEvent.change(screen.getByLabelText('게임 검색'), { target: { value: 'ang' } });
    expect(screen.getByText('Anguna')).toBeInTheDocument();
    expect(screen.queryByText('Nomolos')).not.toBeInTheDocument();
  });

  it('결과가 없으면 안내를 띄운다', () => {
    render(<RetroLibrary builtins={BUILTINS} initialRoms={MY_ROMS} />);
    fireEvent.change(screen.getByLabelText('게임 검색'), { target: { value: '없는게임' } });
    expect(screen.getByText(/조건에 맞는 게임이 없습니다/)).toBeInTheDocument();
  });

  it('아무것도 없으면 다른 안내를 띄운다', () => {
    render(<RetroLibrary builtins={[]} initialRoms={[]} />);
    expect(screen.getByText(/아직 게임이 없습니다/)).toBeInTheDocument();
  });

  it('자산이 없으면 설치 안내를 띄운다', () => {
    render(<RetroLibrary builtins={[]} initialRoms={[]} assetsMissing />);
    expect(screen.getByText(/fetch-emulatorjs\.sh/)).toBeInTheDocument();
  });

  describe('삭제', () => {
    it('기본 제공 게임에는 삭제 버튼이 없다', () => {
      render(<RetroLibrary builtins={BUILTINS} initialRoms={MY_ROMS} />);
      expect(screen.queryByRole('button', { name: 'Nomolos 삭제' })).not.toBeInTheDocument();
    });

    // #155 — 카드의 삭제 버튼은 손이 스치기 쉬운 자리에 있다. 한 번 누르면 끝나면 안 된다.
    it('버튼을 눌러도 **바로 지우지 않는다** — 먼저 확인을 받는다', async () => {
      render(<RetroLibrary builtins={BUILTINS} initialRoms={MY_ROMS} />);
      fireEvent.click(screen.getByRole('button', { name: '내가 올린 롬 삭제' }));

      expect(fetch).not.toHaveBeenCalled();
      // 확인 창에도 이름이 실리므로 목록 쪽으로 범위를 좁혀 본다.
      const grid = screen.getByRole('list', { name: '게임 목록' });
      expect(within(grid).getByText('내가 올린 롬')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('확인 창이 무엇을 지우는지 이름으로 알려 준다', () => {
      render(<RetroLibrary builtins={BUILTINS} initialRoms={MY_ROMS} />);
      fireEvent.click(screen.getByRole('button', { name: '내가 올린 롬 삭제' }));
      expect(within(screen.getByRole('dialog')).getByText(/내가 올린 롬/)).toBeInTheDocument();
    });

    it('취소하면 아무 일도 없다', async () => {
      render(<RetroLibrary builtins={BUILTINS} initialRoms={MY_ROMS} />);
      fireEvent.click(screen.getByRole('button', { name: '내가 올린 롬 삭제' }));
      fireEvent.click(screen.getByRole('button', { name: '롬 삭제 취소' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(fetch).not.toHaveBeenCalled();
      expect(screen.getByText('내가 올린 롬')).toBeInTheDocument();
    });

    it('확인해야 지운다', async () => {
      render(<RetroLibrary builtins={BUILTINS} initialRoms={MY_ROMS} />);
      fireEvent.click(screen.getByRole('button', { name: '내가 올린 롬 삭제' }));
      fireEvent.click(screen.getByRole('button', { name: '롬 삭제 확인' }));

      await waitFor(() => expect(screen.queryByText('내가 올린 롬')).not.toBeInTheDocument());
      expect(fetch).toHaveBeenCalledWith(
        `/api/games/retro/roms/${MY_ROMS[0].id}`,
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('서버가 거부하면 목록에 그대로 둔다', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
      render(<RetroLibrary builtins={BUILTINS} initialRoms={MY_ROMS} />);
      fireEvent.click(screen.getByRole('button', { name: '내가 올린 롬 삭제' }));
      fireEvent.click(screen.getByRole('button', { name: '롬 삭제 확인' }));

      await waitFor(() => expect(fetch).toHaveBeenCalled());
      expect(screen.getByText('내가 올린 롬')).toBeInTheDocument();
    });
  });

  // #116 — 관리가 카드로 옮겨 왔다.
  describe('카드에서 패치 다루기', () => {
    const PATCHED: UserRomDto[] = [
      { ...MY_ROMS[0], patch: { id: 'p1', name: 'ko.ips', format: 'ips', size: 4096 }, patchEnabled: true },
    ];

    it('패치를 올리면 카드가 바로 그 패치를 보여 준다', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { id: 'p9', name: 'new.ips', format: 'ips', size: 8 } }),
      }));
      render(<RetroLibrary builtins={BUILTINS} initialRoms={MY_ROMS} />);

      fireEvent.change(screen.getByLabelText('내가 올린 롬 패치 파일'), {
        target: { files: [new File([new Uint8Array(8)], 'new.ips')] },
      });

      // 파일명은 화면에 적지 않는다 — 버튼 툴팁으로만 확인한다 (#122).
      await waitFor(() =>
        expect(screen.getByRole('button', { name: '내가 올린 롬 패치 교체' }).getAttribute('title'))
          .toContain('new.ips'),
      );
      const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe('/api/games/retro/rom-patch');
      expect((init.body as FormData).get('romId')).toBe(MY_ROMS[0].id);
    });

    it('업로드가 실패하면 이유를 보여 주고 카드는 그대로 둔다', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false, json: async () => ({ message: 'IPS·BPS·UPS 패치 파일이 아닙니다.' }),
      }));
      render(<RetroLibrary builtins={BUILTINS} initialRoms={MY_ROMS} />);

      fireEvent.change(screen.getByLabelText('내가 올린 롬 패치 파일'), {
        target: { files: [new File([new Uint8Array(8)], 'nope.zip')] },
      });

      expect(await screen.findByRole('alert')).toHaveTextContent('IPS·BPS·UPS');
      // 실패했으니 여전히 "올리기" 상태다.
      expect(screen.getByRole('button', { name: '내가 올린 롬 패치 올리기' })).toBeInTheDocument();
    });

    it('체크를 끄면 서버에 알린다', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }));
      render(<RetroLibrary builtins={BUILTINS} initialRoms={PATCHED} />);

      fireEvent.click(screen.getByRole('checkbox'));

      await waitFor(() =>
        expect(fetch).toHaveBeenCalledWith(
          `/api/games/retro/roms/${MY_ROMS[0].id}`,
          expect.objectContaining({ method: 'PATCH' }),
        ),
      );
      // **가라앉은 뒤** 본다. 요청이 도는 동안엔 busy 로 잠겨 있어, 곧바로 재면 CI 부하에서
      // 중간 상태를 잡는다(실제로 그렇게 깨졌다).
      await waitFor(() => {
        const box = screen.getByRole('checkbox');
        expect(box).toBeEnabled();
        expect(box).not.toBeChecked();
      });
    });

    it('토글이 실패하면 체크를 되돌린다 — 화면과 서버가 어긋나면 안 된다', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
      render(<RetroLibrary builtins={BUILTINS} initialRoms={PATCHED} />);

      fireEvent.click(screen.getByRole('checkbox'));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      // 되돌림도 요청이 끝난 뒤에 일어난다 — 가라앉은 상태를 본다.
      await waitFor(() => {
        const box = screen.getByRole('checkbox');
        expect(box).toBeEnabled();
        expect(box).toBeChecked();
      });
    });
  });

  // 분할 셋은 파일을 여럿 골라야 한다 (#143).
  describe('롬 업로드 파일 선택', () => {
    it('여러 파일을 고를 수 있다', () => {
      render(<RetroLibrary builtins={BUILTINS} initialRoms={[]} />);
      // 데스크톱 사이드바·모바일 아래쪽 둘 다 렌더되므로 첫 번째를 본다.
      const input = screen.getAllByLabelText('롬 파일')[0];
      expect(input).toHaveAttribute('multiple');
    });
  });
});
