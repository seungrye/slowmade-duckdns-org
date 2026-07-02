// PortfolioChartClient SSR 계약: initialData 주입 시 초기 fetch 를 건너뛰고,
// 없으면 기본 탭(paper,KRW)을 마운트 시 fetch 한다.
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('echarts-for-react', () => ({ default: () => null }));

import PortfolioChartClient from './portfolio-chart-client';

const initialData = {
  env: 'paper' as const,
  currency: 'KRW' as const,
  history: [{ dateStr: '2026-06-01', totalValue: 100, cash: 10, holdingsValue: 90, cumulativePnl: 5 }],
  tradesByDate: {},
};

describe('PortfolioChartClient — SSR initialData', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('initialData 를 받으면 초기 fetch 없이 렌더한다', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ json: async () => initialData });
    vi.stubGlobal('fetch', fetchSpy);

    render(<PortfolioChartClient initialData={initialData} />);
    await act(async () => {});

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('initialData 없으면 마운트 시 기본 탭(paper,KRW)을 fetch 한다(하위호환)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ json: async () => initialData });
    vi.stubGlobal('fetch', fetchSpy);

    render(<PortfolioChartClient />);
    await act(async () => {});

    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/portfolio?env=paper&currency=KRW');
  });
});
