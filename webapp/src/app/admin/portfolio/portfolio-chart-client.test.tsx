// PortfolioChartClient SSR 계약 + 블록(전략)별 선·마커 (#373).
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

// 차트 옵션을 들여다보려면 렌더 대신 props 를 붙잡아야 한다.
type Captured = { option?: Record<string, unknown>; onEvents?: Record<string, (p: unknown) => void> };
const captured: Captured = {};
vi.mock('echarts-for-react', () => ({
  default: (props: Captured) => {
    captured.option = props.option;
    captured.onEvents = props.onEvents;
    return null;
  },
}));

import PortfolioChartClient from './portfolio-chart-client';

type Series = { type: string; name: string; data: unknown[]; showSymbol?: boolean };
const series = () => (captured.option?.series ?? []) as Series[];
const byName = (n: string) => series().find((s) => s.name === n);

const stats = (buy: number, sell: number) => ({
  buy, sell, buyAmount: buy * 10, sellAmount: sell * 10,
  buyTickers: buy ? ['TQQQ'] : [], sellTickers: sell ? ['TQQQ'] : [],
});

const 날짜 = ['2026-08-10', '2026-08-11'];
const 계좌 = 날짜.map((d, i) => ({
  dateStr: d, totalValue: 1000 + i, cash: 400, holdingsValue: 600 + i, cumulativePnl: 0,
}));

const 두블록 = {
  env: 'paper-50194613',
  currency: 'USD' as const,
  history: 계좌,
  blocks: [
    {
      portfolioId: 'v4', strategy: 'infinite_v4',
      history: 날짜.map((d, i) => ({
        dateStr: d, totalValue: 9999, cash: 0, holdingsValue: 500 + i, cumulativePnl: 0,
      })),
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

const 한블록 = {
  env: 'paper', currency: 'KRW' as const, history: 계좌,
  blocks: [{ portfolioId: 'kr', strategy: 'infinite_v4', history: 계좌, tradesByDate: { '2026-08-10': stats(1, 0) } }],
  tradesByDate: { '2026-08-10': stats(1, 0) },
  unownedTradesByDate: {},
};

const 렌더 = async (data: unknown) => {
  render(<PortfolioChartClient initialData={data as never} />);
  await act(async () => {});
};

describe('PortfolioChartClient — SSR initialData', () => {
  beforeEach(() => { vi.restoreAllMocks(); push.mockClear(); });

  it('initialData 를 받으면 초기 fetch 없이 렌더한다', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ json: async () => 한블록 });
    vi.stubGlobal('fetch', fetchSpy);
    await 렌더(한블록);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('initialData 없으면 마운트 시 기본 탭(paper,KRW)을 fetch 한다(하위호환)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ json: async () => 한블록 });
    vi.stubGlobal('fetch', fetchSpy);
    render(<PortfolioChartClient />);
    await act(async () => {});
    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/portfolio?env=paper&currency=KRW');
  });
});

describe('블록(전략)별 선 (#373)', () => {
  beforeEach(() => { vi.restoreAllMocks(); push.mockClear(); vi.stubGlobal('fetch', vi.fn()); });

  it('블록이 둘이면 전략별 선이 둘 생긴다', async () => {
    await 렌더(두블록);
    expect(byName('무한매수 V4 평가액')).toBeTruthy();
    expect(byName('밸류리밸런싱 VR 평가액')).toBeTruthy();
  });

  it('계좌 3선은 그대로 남는다 — 회귀 없음', async () => {
    await 렌더(두블록);
    for (const n of ['추정 총 재산', '추정 잔여 현금', '보유 평가액']) expect(byName(n)).toBeTruthy();
  });

  it('블록 선은 totalValue 가 아니라 holdingsValue 를 그린다', async () => {
    await 렌더(두블록);
    // 블록의 totalValue 는 9999 지만 그려지는 건 500·501 이다.
    expect(byName('무한매수 V4 평가액')!.data).toEqual([500, 501]);
  });

  it('블록 선들의 합이 계좌 보유 평가액과 대조된다', async () => {
    await 렌더(두블록);
    const v4 = byName('무한매수 V4 평가액')!.data as (number | null)[];
    const vr = byName('밸류리밸런싱 VR 평가액')!.data as (number | null)[];
    const 계좌평가 = byName('보유 평가액')!.data as number[];
    // 08-11: 501 + 100 = 601 = 계좌 601
    expect((v4[1] ?? 0) + (vr[1] ?? 0)).toBe(계좌평가[1]);
  });

  it('그 블록이 없던 날은 빈 값이다', async () => {
    await 렌더(두블록);
    expect((byName('밸류리밸런싱 VR 평가액')!.data as unknown[])[0]).toBeNull();
  });

  it('점이 하나뿐인 블록은 점을 보인다 — 안 그러면 아무것도 안 그려진다', async () => {
    await 렌더(두블록);
    expect(byName('밸류리밸런싱 VR 평가액')!.showSymbol).toBe(true);
    expect(byName('무한매수 V4 평가액')!.showSymbol).toBe(false);
  });

  it('블록이 하나뿐이면 계좌 선과 겹치므로 안 그린다', async () => {
    await 렌더(한블록);
    expect(series().some((s) => s.name.endsWith('평가액') && s.name !== '보유 평가액')).toBe(false);
  });
});

describe('블록별 매매 마커 (#373)', () => {
  beforeEach(() => { vi.restoreAllMocks(); push.mockClear(); vi.stubGlobal('fetch', vi.fn()); });

  it('마커가 블록별 시리즈로 나뉜다', async () => {
    await 렌더(두블록);
    expect(byName('무한매수 V4 매매')).toBeTruthy();
    expect(byName('밸류리밸런싱 VR 매매')).toBeTruthy();
  });

  it('마커는 그 블록 선 위(평가액)에 찍힌다', async () => {
    await 렌더(두블록);
    const item = (byName('무한매수 V4 매매')!.data[0] as { value: [string, number] });
    expect(item.value).toEqual(['2026-08-10', 500]);
  });

  it('매수만은 ▲, 매수+매도는 ■', async () => {
    await 렌더(두블록);
    expect((byName('무한매수 V4 매매')!.data[0] as { symbol: string }).symbol).toBe('triangle');
    expect((byName('밸류리밸런싱 VR 매매')!.data[0] as { symbol: string }).symbol).toBe('rect');
  });

  it('주인 없는 매매만 계좌 선에 「기타 매매」로 남는다 — 두 번 찍히지 않는다', async () => {
    await 렌더(두블록);
    const 기타 = byName('기타 매매')!;
    expect(기타.data).toHaveLength(1);
    expect((기타.data[0] as { value: [string, number] }).value).toEqual(['2026-08-10', 1000]);
    // 블록이 나뉘었으니 옛 3종 시리즈는 없다.
    expect(byName('▲ 매수만')).toBeUndefined();
  });

  it('블록이 하나면 종전대로 방향별 3종으로 찍는다', async () => {
    await 렌더(한블록);
    expect(byName('▲ 매수만')).toBeTruthy();
    expect(byName('무한매수 V4 매매')).toBeUndefined();
  });

  it('블록 마커를 누르면 그 블록의 매매 상세로 간다', async () => {
    await 렌더(두블록);
    captured.onEvents!.click({ data: { value: ['2026-08-10', 500], portfolioId: 'v4' } });
    expect(push).toHaveBeenCalledWith(expect.stringContaining('portfolioId=v4'));
    expect(push).toHaveBeenCalledWith(expect.stringContaining('center=2026-08-10'));
  });

  it('주인 없는 마커를 누르면 portfolioId 없이 간다', async () => {
    await 렌더(두블록);
    captured.onEvents!.click({ data: { value: ['2026-08-10', 1000], portfolioId: '' } });
    expect(push).toHaveBeenCalledWith(expect.not.stringContaining('portfolioId'));
  });
});
