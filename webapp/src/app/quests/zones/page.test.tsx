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
    // 신규 zone 폼의 generator select 한 개. 옵션(27종+) 중 핵심만 검사.
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

describe('SystemZonesPanel Town 옵션 form', () => {
  function mockFetchByUrl(townConfig?: Partial<{ data: Record<string, unknown> }>) {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const u = typeof url === 'string' ? url : (url as Request).url;
      if (u.includes('/api/quests/town-config')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => townConfig ?? ({ data: {
            _id: 'default',
            size: 'village', roads: 'radial', wealth: 'common',
            defenses: 'none', landmarks: ['inn', 'smithy'],
            fields: true, environment: 'plains', version: 1,
          } }),
        } as Response);
      }
      return Promise.resolve({
        ok: true, status: 200,
        json: async () => ({ data: mockZones }),
      } as Response);
    });
  }

  it('Town 옵션 form 이 6 개 옵션과 저장/기본값 버튼을 렌더한다 (size 제외)', async () => {
    mockFetchByUrl();
    const { container } = render(<ZonesPage />);
    await act(async () => {});
    // 옵션 라벨 일부 검증
    expect(container.textContent).toContain('Town 생성 옵션');
    // 'size (마을 규모)' 는 정책 변경(landmark+villager 수로 자동 결정)으로 UI 에서 제거됨.
    expect(container.textContent).toContain('roads (도로 형태)');
    expect(container.textContent).toContain('wealth (부유함)');
    expect(container.textContent).toContain('defenses (방어 시설)');
    expect(container.textContent).toContain('environment (지리 환경)');
    expect(container.textContent).toContain('landmarks');
    expect(container.textContent).toContain('fields (외곽 농경지)');
    // 버튼
    expect(screen.getByText('저장')).toBeTruthy();
    expect(screen.getByText('기본값 복원')).toBeTruthy();
  });

  it('size 무관 — Manor 체크박스도 항상 enabled (Plains)', async () => {
    // 정책 변경: size 옵션 deprecate. 모든 landmark 가 size 무관 사용 가능.
    mockFetchByUrl({ data: {
      _id: 'default',
      size: 'hamlet', roads: 'radial', wealth: 'common',
      defenses: 'none', landmarks: [],
      fields: true, environment: 'plains', version: 1,
    } });
    const { container } = render(<ZonesPage />);
    await act(async () => {});
    const manorBox = container.querySelector('input[aria-label="town-landmark-manor"]') as HTMLInputElement | null;
    expect(manorBox).toBeTruthy();
    expect(manorBox!.disabled).toBe(false);
  });

  it('Plains 일 때 Docks 체크박스가 disabled (Coastal 전용)', async () => {
    mockFetchByUrl();
    const { container } = render(<ZonesPage />);
    await act(async () => {});
    const docksBox = container.querySelector('input[aria-label="town-landmark-docks"]') as HTMLInputElement | null;
    expect(docksBox).toBeTruthy();
    expect(docksBox!.disabled).toBe(true);
  });

  it('Town generator 가 카탈로그 generator select 옵션에 포함된다', async () => {
    mockFetchByUrl();
    const { container } = render(<ZonesPage />);
    await act(async () => {});
    fireEvent.click(screen.getByText('+ 새 zone'));
    const selects = container.querySelectorAll('select');
    const opts = Array.from(selects).flatMap((s) => Array.from(s.querySelectorAll('option')));
    const values = opts.map((o) => (o as HTMLOptionElement).value);
    expect(values).toContain('town');
  });

  it('저장 버튼 클릭 시 PUT 요청을 보낸다', async () => {
    mockFetchByUrl();
    render(<ZonesPage />);
    await act(async () => {});
    const fetchSpy = vi.spyOn(global, 'fetch');
    fetchSpy.mockClear();
    fetchSpy.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ data: {} }),
    } as Response);
    await act(async () => {
      fireEvent.click(screen.getByText('저장'));
    });
    const calls = fetchSpy.mock.calls.filter((c) => {
      const u = typeof c[0] === 'string' ? c[0] : (c[0] as Request).url;
      return u.includes('/api/quests/town-config');
    });
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const putCall = calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PUT');
    expect(putCall).toBeTruthy();
  });
});
