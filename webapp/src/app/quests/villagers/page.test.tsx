// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';
import VillagersPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({}) }));

const mockVillagers = [
  { _id: '1', id: 'elder', name: '장로', color: [0.9, 0.8, 0.5], dialogs: [], speed: 0.5, version: 1 },
  { _id: '2', id: 'burgomaster', name: '촌장', color: [1.0, 0.85, 0.0], dialogs: ['안녕', '잘가'], speed: 1.0, version: 3 },
];

// page.tsx 는 villagers 외에 /api/quests/town-config 도 호출하므로 URL 별 응답이 필요.
// town-config 응답에 landmarks 등 배열 필드가 빠지면 useMemo 내부에서 iterable 오류 발생.
const mockTownConfig = {
  size: 'village',
  algorithm: 'grid',
  roads: 'radial',
  wealth: 'common',
  defenses: 'none',
  landmarks: ['inn', 'smithy'],
  fields: true,
  environment: 'plains',
};

function mockFetchByUrl(villagers: unknown = mockVillagers) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/quests/town-config')) {
      return { json: async () => ({ data: mockTownConfig }), ok: true } as Response;
    }
    return { json: async () => ({ data: villagers }), ok: true } as Response;
  });
}

beforeEach(() => {
  mockFetchByUrl();
});

describe('VillagersPage 렌더', () => {
  it('타이틀을 표시한다', async () => {
    render(<VillagersPage />);
    await act(async () => {});
    expect(screen.getByText('Villager 카탈로그')).toBeTruthy();
  });

  it('목록의 villager name 을 모두 렌더한다', async () => {
    render(<VillagersPage />);
    await act(async () => {});
    expect(screen.getByText('장로')).toBeTruthy();
    expect(screen.getByText('촌장')).toBeTruthy();
  });

  it('id 와 대사 수 메타 정보가 표시된다', async () => {
    const { container } = render(<VillagersPage />);
    await act(async () => {});
    const text = container.textContent ?? '';
    expect(text).toContain('elder');
    expect(text).toContain('burgomaster');
    expect(text).toContain('대사 0줄');
    expect(text).toContain('대사 2줄');
  });

  it('각 행에 히스토리 링크가 렌더된다', async () => {
    render(<VillagersPage />);
    await act(async () => {});
    expect(screen.getByText('히스토리 (v1)')).toBeTruthy();
    expect(screen.getByText('히스토리 (v3)')).toBeTruthy();
  });
});

describe('VillagersPage 신규 폼', () => {
  it('+ 새 villager 클릭 시 폼이 열린다', async () => {
    render(<VillagersPage />);
    await act(async () => {});
    fireEvent.click(screen.getByText('+ 새 villager'));
    expect(screen.getByText('생성')).toBeTruthy();
  });

  it('생성 폼에 컬러 피커(input type=color)가 렌더된다', async () => {
    const { container } = render(<VillagersPage />);
    await act(async () => {});
    fireEvent.click(screen.getByText('+ 새 villager'));
    const colorInput = container.querySelector('input[type="color"]') as HTMLInputElement | null;
    expect(colorInput).toBeTruthy();
    // 랜덤 기본값이라 흰색 고정이 아님 (유효한 hex)
    expect(colorInput!.value).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('VillagersPage 빈 상태', () => {
  it('등록된 villager 가 없으면 안내 메시지', async () => {
    mockFetchByUrl([]);
    render(<VillagersPage />);
    await act(async () => {});
    expect(screen.getByText(/등록된 villager 가 없습니다/)).toBeTruthy();
  });
});
