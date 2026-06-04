// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, fireEvent, screen } from '@testing-library/react';
import ScenesPage from './page';

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
}));

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ data: mockScenes }),
  } as Response);
});

describe('ScenesPage — 목록', () => {
  it('씬 목록이 API 에서 fetch 되어 18 개 행으로 렌더된다', async () => {
    const { container } = render(<ScenesPage />);
    await act(async () => {});
    const rows = container.querySelectorAll('[data-scene-row]');
    expect(rows.length).toBe(18);
  });

  it('각 행에 id / title / choices.length / isEnding 여부가 노출된다', async () => {
    const { container } = render(<ScenesPage />);
    await act(async () => {});
    expect(container.textContent).toContain('scene_00');
    expect(container.textContent).toContain('씬 0');
    expect(container.textContent).toContain('엔딩');
  });

  it('검색어 입력 시 title 부분 일치로 필터링된다', async () => {
    render(<ScenesPage />);
    await act(async () => {});
    const search = screen.getByPlaceholderText('씬 검색 (id 또는 제목)') as HTMLInputElement;
    fireEvent.change(search, { target: { value: '씬 5' } });
    expect(search.value).toBe('씬 5');
    // 필터링 후 보이는 행은 1 개 (씬 5)
    const visible = document.querySelectorAll('[data-scene-row]');
    expect(visible.length).toBe(1);
  });

  it('검색어가 id 부분과 일치하면 노출', async () => {
    render(<ScenesPage />);
    await act(async () => {});
    const search = screen.getByPlaceholderText('씬 검색 (id 또는 제목)') as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'scene_17' } });
    const visible = document.querySelectorAll('[data-scene-row]');
    expect(visible.length).toBe(1);
  });

  it('신규 생성 버튼이 노출된다', async () => {
    render(<ScenesPage />);
    await act(async () => {});
    expect(screen.getByText('+ 새 씬')).toBeTruthy();
  });
});
