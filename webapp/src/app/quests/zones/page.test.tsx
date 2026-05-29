// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';
import ZonesPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({}) }));

const mockZones = [
  { _id: '1', name: 'demon_cave', generator: 'cellular_automata', description: '마귀 동굴', version: 1 },
  { _id: '2', name: 'herb_glade', generator: 'forest', description: '', version: 3 },
];

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    json: async () => ({ data: mockZones }),
    ok: true,
  } as Response);
});

describe('ZonesPage 렌더', () => {
  it('타이틀과 모든 zone name 을 표시', async () => {
    render(<ZonesPage />);
    await act(async () => {});
    expect(screen.getByText('Zone 카탈로그')).toBeTruthy();
    expect(screen.getByText('demon_cave')).toBeTruthy();
    expect(screen.getByText('herb_glade')).toBeTruthy();
  });

  it('각 행에 generator 와 description 표시', async () => {
    const { container } = render(<ZonesPage />);
    await act(async () => {});
    expect(container.textContent).toContain('cellular_automata');
    expect(container.textContent).toContain('마귀 동굴');
    expect(container.textContent).toContain('forest');
    expect(container.textContent).toContain('(설명 없음)');
  });

  it('각 행에 히스토리 링크 (version 표시)', async () => {
    render(<ZonesPage />);
    await act(async () => {});
    expect(screen.getByText('히스토리 (v1)')).toBeTruthy();
    expect(screen.getByText('히스토리 (v3)')).toBeTruthy();
  });

  it('퀘스트에서 추출 버튼이 렌더된다', async () => {
    render(<ZonesPage />);
    await act(async () => {});
    expect(screen.getByText('퀘스트에서 추출')).toBeTruthy();
  });
});

describe('ZonesPage 신규 폼', () => {
  it('+ 새 zone 클릭 시 폼이 열린다', async () => {
    render(<ZonesPage />);
    await act(async () => {});
    fireEvent.click(screen.getByText('+ 새 zone'));
    expect(screen.getByText('생성')).toBeTruthy();
  });

  it('generator 가 strict select 로 KNOWN_GENERATORS 옵션을 제공한다', async () => {
    // datalist → strict select 로 바뀜 (게임에 없는 generator 자유 입력 방지).
    const { container } = render(<ZonesPage />);
    await act(async () => {});
    fireEvent.click(screen.getByText('+ 새 zone'));
    const selects = container.querySelectorAll('select');
    // 신규 zone 폼의 generator select 한 개. 옵션 23개 중 핵심만 검사.
    const opts = Array.from(selects).flatMap((s) => Array.from(s.querySelectorAll('option')));
    const values = opts.map((o) => (o as HTMLOptionElement).value);
    expect(values).toContain('bsp');
    expect(values).toContain('forest');
    expect(values).toContain('cellular_automata');
    expect(values).toContain('walled_town'); // 신규 23종에 포함되는지 검증
  });
});

describe('ZonesPage 빈 상태', () => {
  it('등록된 zone 이 없으면 안내', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({ data: [] }),
      ok: true,
    } as Response);
    render(<ZonesPage />);
    await act(async () => {});
    expect(screen.getByText(/등록된 zone 이 없습니다/)).toBeTruthy();
  });
});
