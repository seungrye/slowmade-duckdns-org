// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SaveStatePanel from './SaveStatePanel';

const GAME = 'builtin:nomolos';
const META = { size: 812 * 1024, hasShot: true, updatedAt: '2026-08-13T01:22:00.000Z' };

function mockFetch(impl: (url: string, init?: RequestInit) => unknown) {
  const fn = vi.fn((url: string, init?: RequestInit) => Promise.resolve(impl(url, init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('SaveStatePanel', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('저장이 없으면 그렇게 알려 준다', async () => {
    mockFetch(() => ({ ok: true, json: async () => ({ data: null }) }));
    render(<SaveStatePanel gameKey={GAME} />);
    expect(await screen.findByText(/아직 저장된 상태가 없습니다/)).toBeInTheDocument();
  });

  it('저장이 있으면 시각·크기·썸네일을 보여 준다', async () => {
    mockFetch(() => ({ ok: true, json: async () => ({ data: META }) }));
    render(<SaveStatePanel gameKey={GAME} />);

    expect(await screen.findByText(/812 KB/)).toBeInTheDocument();
    const img = document.querySelector('img');
    expect(img?.getAttribute('src')).toBe(`/api/games/retro/states/shot?game=${encodeURIComponent(GAME)}`);
  });

  it('썸네일이 없으면 이미지를 그리지 않는다', async () => {
    mockFetch(() => ({ ok: true, json: async () => ({ data: { ...META, hasShot: false } }) }));
    render(<SaveStatePanel gameKey={GAME} />);
    await screen.findByText(/812 KB/);
    expect(document.querySelector('img')).toBeNull();
  });

  it('게임 키를 인코딩해 조회한다 — 키에 콜론이 들어간다', async () => {
    const fetchFn = mockFetch(() => ({ ok: true, json: async () => ({ data: null }) }));
    render(<SaveStatePanel gameKey={GAME} />);
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    expect(fetchFn.mock.calls[0][0]).toBe(`/api/games/retro/states?game=builtin%3Anomolos`);
  });

  it('삭제하면 목록이 비워진다', async () => {
    mockFetch((_url, init) =>
      init?.method === 'DELETE'
        ? { ok: true, json: async () => ({ data: { deleted: true } }) }
        : { ok: true, json: async () => ({ data: META }) },
    );
    render(<SaveStatePanel gameKey={GAME} />);
    await screen.findByText(/812 KB/);

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(await screen.findByText(/아직 저장된 상태가 없습니다/)).toBeInTheDocument();
  });

  it('저장·불러오기 버튼은 만들지 않는다 — 에뮬레이터 것을 쓴다', async () => {
    mockFetch(() => ({ ok: true, json: async () => ({ data: META }) }));
    render(<SaveStatePanel gameKey={GAME} />);
    await screen.findByText(/812 KB/);

    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    expect(labels).toEqual(['새로고침', '삭제']);
    expect(screen.getByText(/Save State/)).toBeInTheDocument(); // 안내 문구로만 언급
  });

  it('조회가 실패해도 죽지 않는다', async () => {
    mockFetch(() => ({ ok: false, json: async () => ({}) }));
    render(<SaveStatePanel gameKey={GAME} />);
    expect(await screen.findByText(/아직 저장된 상태가 없습니다/)).toBeInTheDocument();
  });
});
