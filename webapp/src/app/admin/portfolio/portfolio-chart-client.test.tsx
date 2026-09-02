// PortfolioChartClient — SSR 계약 + HTML 범례 + 마커 클릭 (#378).
// 옵션 조립 자체는 chart-option.test.ts 가 본다.
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

type Captured = { onEvents?: Record<string, (p: unknown) => void> };
const captured: Captured = {};
vi.mock('echarts-for-react', () => ({
  default: Object.assign(
    (props: Captured) => {
      captured.onEvents = props.onEvents;
      return null;
    },
    // ref 로 getEchartsInstance 를 부르므로 forwardRef 흉내가 필요하다.
    { $$typeof: Symbol.for('react.forward_ref') },
  ),
}));

import PortfolioChartClient from './portfolio-chart-client';

const stats = (buy: number, sell: number) => ({
  buy, sell, buyAmount: buy * 10, sellAmount: sell * 10,
  buyTickers: buy ? ['TQQQ'] : [], sellTickers: sell ? ['TQQQ'] : [],
});
const 날짜 = ['2026-08-10', '2026-08-11'];
const 계좌 = 날짜.map((d, i) => ({
  dateStr: d, totalValue: 1000 + i, cash: 400, holdingsValue: 600 + i, cumulativePnl: 0,
}));
const 두블록 = {
  env: 'paper-50194613', currency: 'USD' as const, history: 계좌,
  blocks: [
    {
      portfolioId: 'v4', strategy: 'infinite_v4',
      history: 날짜.map((d, i) => ({ dateStr: d, totalValue: 9999, cash: 0, holdingsValue: 500 + i, cumulativePnl: 0 })),
      tradesByDate: { '2026-08-10': stats(2, 0) },
    },
    {
      portfolioId: 'vr', strategy: 'value_rebalancing',
      history: [{ dateStr: '2026-08-11', totalValue: 8888, cash: 0, holdingsValue: 100, cumulativePnl: 0 }],
      tradesByDate: { '2026-08-11': stats(1, 1) },
    },
  ],
  tradesByDate: { '2026-08-10': stats(3, 0), '2026-08-11': stats(1, 1) },
  unownedTradesByDate: { '2026-08-10': stats(1, 0) },
};

const 렌더 = async (data: unknown = 두블록) => {
  render(<PortfolioChartClient initialData={data as never} />);
  await act(async () => {});
};

describe('SSR initialData', () => {
  beforeEach(() => { vi.restoreAllMocks(); push.mockClear(); });

  it('initialData 를 받으면 초기 fetch 없이 렌더한다', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ json: async () => 두블록 });
    vi.stubGlobal('fetch', fetchSpy);
    await 렌더();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('initialData 없으면 마운트 시 기본 탭(paper,KRW)을 fetch 한다(하위호환)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ json: async () => 두블록 });
    vi.stubGlobal('fetch', fetchSpy);
    render(<PortfolioChartClient />);
    await act(async () => {});
    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/portfolio?env=paper&currency=KRW');
  });
});

describe('HTML 범례 (#378)', () => {
  beforeEach(() => { vi.restoreAllMocks(); push.mockClear(); vi.stubGlobal('fetch', vi.fn()); });

  it('범례가 차트 밖 일반 흐름에 그려진다 — 캔버스 위에 얹지 않는다', async () => {
    await 렌더();
    const ul = screen.getByLabelText('차트 범례');
    expect(ul.tagName).toBe('UL');
    // 겹침의 원인이던 절대배치가 아니어야 한다.
    expect(ul.className).not.toContain('absolute');
  });

  it('계열마다 항목이 하나씩 나온다', async () => {
    await 렌더();
    for (const n of ['추정 총 재산', '추정 잔여 현금', '보유 평가액',
                     '무한매수 V4 평가액', '밸류리밸런싱 VR 평가액', '기타 매매']) {
      expect(screen.getByRole('button', { name: n })).toBeTruthy();
    }
  });

  it('항목을 누르면 그 계열이 꺼진 표시가 된다', async () => {
    await 렌더();
    const btn = screen.getByRole('button', { name: '무한매수 V4 평가액' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('마커 클릭', () => {
  beforeEach(() => { vi.restoreAllMocks(); push.mockClear(); vi.stubGlobal('fetch', vi.fn()); });

  it('블록 마커를 누르면 그 블록의 매매 상세로 간다', async () => {
    await 렌더();
    captured.onEvents!.click({ data: { value: ['2026-08-10', 500], portfolioId: 'v4' } });
    expect(push).toHaveBeenCalledWith(expect.stringContaining('portfolioId=v4'));
    expect(push).toHaveBeenCalledWith(expect.stringContaining('center=2026-08-10'));
  });

  it('주인 없는 마커를 누르면 portfolioId 없이 간다', async () => {
    await 렌더();
    captured.onEvents!.click({ data: { value: ['2026-08-10', 1000], portfolioId: '' } });
    expect(push).toHaveBeenCalledWith(expect.not.stringContaining('portfolioId'));
  });
});
