// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import RetroLibrary from './RetroLibrary';
import type { BuiltinGame, UserRomDto } from '@/lib/retro/entry';

const BUILTINS: BuiltinGame[] = [
  { slug: 'nomolos', title: 'Nomolos', platform: 'nes', file: 'nomolos.nes', source: 'https://x.test', license: '홈브류' },
  { slug: 'anguna', title: 'Anguna', platform: 'gba', file: 'anguna.gba', source: 'https://x.test', license: '홈브류' },
];

const MY_ROMS: UserRomDto[] = [
  { id: '653f1a2b3c4d5e6f70819202', title: '내가 올린 롬', platform: 'md', size: 2 * 1024 * 1024, createdAt: '2026-08-12T00:00:00.000Z' },
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
    fireEvent.click(sidebarButton('NES'));
    expect(screen.getByText('Nomolos')).toBeInTheDocument();
    expect(screen.queryByText('Anguna')).not.toBeInTheDocument();
    expect(screen.queryByText('내가 올린 롬')).not.toBeInTheDocument();
  });

  it('사이드바 배지가 기종별 개수를 보여 준다', () => {
    render(<RetroLibrary builtins={BUILTINS} initialRoms={MY_ROMS} />);
    expect(sidebarButton('전체')).toHaveTextContent('3');
    expect(sidebarButton('NES')).toHaveTextContent('1');
    expect(sidebarButton('SNES')).toHaveTextContent('0');
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

    it('내 롬은 지우면 목록에서 빠진다', async () => {
      render(<RetroLibrary builtins={BUILTINS} initialRoms={MY_ROMS} />);
      fireEvent.click(screen.getByRole('button', { name: '내가 올린 롬 삭제' }));

      await waitFor(() => expect(screen.queryByText('내가 올린 롬')).not.toBeInTheDocument());
      expect(fetch).toHaveBeenCalledWith(
        `/api/games/retro/roms/${MY_ROMS[0].id}`,
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('서버가 거부하면 목록에 그대로 둔다', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
      render(<RetroLibrary builtins={BUILTINS} initialRoms={MY_ROMS} />);
      fireEvent.click(screen.getByRole('button', { name: '내가 올린 롬 삭제' }));

      await waitFor(() => expect(fetch).toHaveBeenCalled());
      expect(screen.getByText('내가 올린 롬')).toBeInTheDocument();
    });
  });
});
