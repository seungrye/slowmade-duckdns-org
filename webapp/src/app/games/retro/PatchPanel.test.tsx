// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import PatchPanel from './PatchPanel';
import type { UserPatchDto } from '@/lib/retro/rom-dto';

const push = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

const ROM_ID = '653f1a2b3c4d5e6f70819202';
const PATCHES: UserPatchDto[] = [
  { id: 'p1', name: '한글패치_v1.2.ips', format: 'ips', size: 512 * 1024, createdAt: '2026-08-12T00:00:00.000Z' },
  { id: 'p2', name: 'bugfix.bps', format: 'bps', size: 1024, createdAt: '2026-08-12T00:00:00.000Z' },
];

describe('PatchPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { id: 'new1' } }) }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('원본과 패치들을 모두 보여 준다', () => {
    render(<PatchPanel romId={ROM_ID} patches={PATCHES} selected={null} />);
    expect(screen.getByText('원본')).toBeInTheDocument();
    expect(screen.getByText('한글패치_v1.2.ips')).toBeInTheDocument();
    expect(screen.getByText('bugfix.bps')).toBeInTheDocument();
    // 원본 + 패치 2 개 = 라디오 3 개
    expect(within(screen.getByRole('list', { name: '판본 목록' })).getAllByRole('radio')).toHaveLength(3);
  });

  it('아무것도 안 고르면 원본이 선택돼 있다', () => {
    render(<PatchPanel romId={ROM_ID} patches={PATCHES} selected={null} />);
    const radios = screen.getAllByRole('radio');
    expect((radios[0] as HTMLInputElement).checked).toBe(true);
  });

  it('패치를 고르면 그 주소로 이동한다', () => {
    render(<PatchPanel romId={ROM_ID} patches={PATCHES} selected={null} />);
    fireEvent.click(screen.getAllByRole('radio')[1]);
    expect(push).toHaveBeenCalledWith(`/games/retro/play/rom/${ROM_ID}?patch=p1`);
  });

  it('원본으로 되돌리면 쿼리가 사라진다', () => {
    render(<PatchPanel romId={ROM_ID} patches={PATCHES} selected="p1" />);
    fireEvent.click(screen.getAllByRole('radio')[0]);
    expect(push).toHaveBeenCalledWith(`/games/retro/play/rom/${ROM_ID}`);
  });

  describe('헤더 토글', () => {
    it('IPS 를 고른 경우에만 나온다 — BPS·UPS 는 CRC 로 자동 판별된다', () => {
      const { rerender } = render(<PatchPanel romId={ROM_ID} patches={PATCHES} selected="p1" />);
      expect(screen.getByText(/헤더 512바이트 떼고 적용/)).toBeInTheDocument();

      rerender(<PatchPanel romId={ROM_ID} patches={PATCHES} selected="p2" />);
      expect(screen.queryByText(/헤더 512바이트 떼고 적용/)).not.toBeInTheDocument();
    });

    it('원본을 고르면 나오지 않는다', () => {
      render(<PatchPanel romId={ROM_ID} patches={PATCHES} selected={null} />);
      expect(screen.queryByText(/헤더 512바이트 떼고 적용/)).not.toBeInTheDocument();
    });

    it('뒤집으면 strip 파라미터가 실린다', () => {
      render(<PatchPanel romId={ROM_ID} patches={PATCHES} selected="p1" />);
      fireEvent.click(screen.getByRole('checkbox'));
      expect(push).toHaveBeenCalledWith(`/games/retro/play/rom/${ROM_ID}?patch=p1&strip=0`);
    });
  });

  describe('업로드', () => {
    function upload(file: File) {
      fireEvent.change(screen.getByLabelText('패치 파일'), { target: { files: [file] } });
    }

    it('올리면 롬 id 와 함께 보내고, 올린 패치를 바로 적용한다', async () => {
      render(<PatchPanel romId={ROM_ID} patches={PATCHES} selected={null} />);
      upload(new File([new Uint8Array(8)], 'ko.ips'));

      await waitFor(() => expect(fetch).toHaveBeenCalled());
      const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe('/api/games/retro/rom-patch');
      expect((init.body as FormData).get('romId')).toBe(ROM_ID);

      await waitFor(() =>
        expect(push).toHaveBeenCalledWith(`/games/retro/play/rom/${ROM_ID}?patch=new1`),
      );
    });

    it('서버가 거부하면 이유를 보여 주고 이동하지 않는다', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message: 'IPS·BPS·UPS 패치 파일이 아닙니다.' }) }),
      );
      render(<PatchPanel romId={ROM_ID} patches={PATCHES} selected={null} />);
      upload(new File([new Uint8Array(8)], 'nope.zip'));

      expect(await screen.findByRole('alert')).toHaveTextContent('IPS·BPS·UPS');
      expect(push).not.toHaveBeenCalled();
    });

    it('한도를 넘으면 보내지도 않는다', async () => {
      render(<PatchPanel romId={ROM_ID} patches={PATCHES} selected={null} />);
      upload(new File([new Uint8Array(9 * 1024 * 1024)], 'big.ips'));

      expect(await screen.findByRole('alert')).toHaveTextContent(/너무 큽니다/);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('삭제', () => {
    it('지우면 그 패치를 지우는 요청을 보낸다', async () => {
      render(<PatchPanel romId={ROM_ID} patches={PATCHES} selected={null} />);
      fireEvent.click(screen.getByRole('button', { name: '한글패치_v1.2.ips 삭제' }));

      await waitFor(() =>
        expect(fetch).toHaveBeenCalledWith(
          `/api/games/retro/roms/${ROM_ID}/patches/p1`,
          expect.objectContaining({ method: 'DELETE' }),
        ),
      );
    });

    it('지금 쓰던 패치를 지우면 원본으로 되돌린다', async () => {
      render(<PatchPanel romId={ROM_ID} patches={PATCHES} selected="p1" />);
      fireEvent.click(screen.getByRole('button', { name: '한글패치_v1.2.ips 삭제' }));

      await waitFor(() => expect(push).toHaveBeenCalledWith(`/games/retro/play/rom/${ROM_ID}`));
    });
  });
});
