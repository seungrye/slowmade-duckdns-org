// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, fireEvent, screen } from '@testing-library/react';
import ScenesClient from './scenes-client';
import type { Scene } from '@/types/web-adventure';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockScenes = Array.from({ length: 18 }).map((_, i) => ({
  id: `scene_${i.toString().padStart(2, '0')}`,
  title: `씬 ${i}`,
  illustration: 'x.png',
  body: ['본문'],
  choices: i % 2 === 0 ? [{ kind: 'plain', id: 'c1', label: '계속', to: 'scene_00' }] : [],
  isEnding: i === 17,
  endingId: i === 17 ? 'main' : undefined,
  // 옛 quest CMS 패턴 — 씬마다 revision 카운트.
  revisionCount: i,
}));

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ data: mockScenes }),
  } as Response);
});

describe('ScenesPage — 목록', () => {
  it('씬 목록이 API 에서 fetch 되어 18 개 행으로 렌더된다', async () => {
    const { container } = render(<ScenesClient />);
    await act(async () => {});
    const rows = container.querySelectorAll('[data-scene-row]');
    expect(rows.length).toBe(18);
  });

  it('각 행에 id / title / choices.length / isEnding 여부가 노출된다', async () => {
    const { container } = render(<ScenesClient />);
    await act(async () => {});
    expect(container.textContent).toContain('scene_00');
    expect(container.textContent).toContain('씬 0');
    expect(container.textContent).toContain('엔딩');
  });

  it('검색어 입력 시 title 부분 일치로 필터링된다', async () => {
    render(<ScenesClient />);
    await act(async () => {});
    const search = screen.getByPlaceholderText('씬 검색 (id 또는 제목)') as HTMLInputElement;
    fireEvent.change(search, { target: { value: '씬 5' } });
    expect(search.value).toBe('씬 5');
    // 필터링 후 보이는 행은 1 개 (씬 5)
    const visible = document.querySelectorAll('[data-scene-row]');
    expect(visible.length).toBe(1);
  });

  it('검색어가 id 부분과 일치하면 노출', async () => {
    render(<ScenesClient />);
    await act(async () => {});
    const search = screen.getByPlaceholderText('씬 검색 (id 또는 제목)') as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'scene_17' } });
    const visible = document.querySelectorAll('[data-scene-row]');
    expect(visible.length).toBe(1);
  });

  it('신규 생성 버튼이 노출된다', async () => {
    render(<ScenesClient />);
    await act(async () => {});
    expect(screen.getByText('+ 새 씬')).toBeTruthy();
  });

  // 옛 quest CMS 패턴 — 각 행에 v{revisionCount} 칩.
  it('각 행에 v{revisionCount} 형식의 리비전 badge 가 노출된다', async () => {
    const { container } = render(<ScenesClient />);
    await act(async () => {});
    // scene_03 → v3, scene_05 → v5 등.
    expect(container.textContent).toContain('v3');
    expect(container.textContent).toContain('v5');
    expect(container.textContent).toContain('v17');
    // v0 도 명시 (scene_00).
    expect(container.textContent).toContain('v0');
  });
});

describe('ScenesClient — SSR initialScenes 주입', () => {
  it('initialScenes 를 받으면 초기 fetch 없이 즉시 18 행을 렌더한다', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    fetchSpy.mockClear();

    const { container } = render(
      <ScenesClient initialScenes={mockScenes as unknown as Scene[]} />,
    );
    await act(async () => {});

    expect(container.querySelectorAll('[data-scene-row]').length).toBe(18);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
