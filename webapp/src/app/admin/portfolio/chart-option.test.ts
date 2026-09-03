// 매매 차트 옵션 조립 (#373·#378). ECharts 를 목으로 감싸지 않고 옵션만 본다.
import { describe, it, expect } from 'vitest';
import { buildChartOption, type PortfolioResponse } from './chart-option';

const strategyLabel = (s: string) =>
  ({ infinite_v4: '무한매수 V4', value_rebalancing: '밸류리밸런싱 VR' }[s] ?? '기타');

const stats = (buy: number, sell: number) => ({
  buy, sell, buyAmount: buy * 10, sellAmount: sell * 10,
  buyTickers: buy ? ['TQQQ'] : [], sellTickers: sell ? ['TQQQ'] : [],
});

const 날짜 = ['2026-08-10', '2026-08-11'];
const 계좌 = 날짜.map((d, i) => ({
  dateStr: d, totalValue: 1000 + i, cash: 400, holdingsValue: 600 + i, cumulativePnl: 0,
}));

const 두블록: PortfolioResponse = {
  env: 'paper-50194613', currency: 'USD', history: 계좌,
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

// 국장 — 블록이 하나. 여기서 전략 선·마커가 사라지던 것이 #378 의 신고 내용이다.
const 한블록: PortfolioResponse = {
  env: 'paper-50194613', currency: 'KRW', history: 계좌,
  blocks: [{
    portfolioId: 'kr', strategy: 'infinite_v4',
    history: 날짜.map((d, i) => ({ dateStr: d, totalValue: 7777, cash: 0, holdingsValue: 600 + i, cumulativePnl: 0 })),
    tradesByDate: { '2026-08-10': stats(1, 0), '2026-08-11': stats(0, 2) },
  }],
  tradesByDate: { '2026-08-10': stats(1, 0), '2026-08-11': stats(0, 2) },
  unownedTradesByDate: {},
};

type S = { type: string; name: string; data: unknown[]; showSymbol?: boolean };
const build = (data: PortfolioResponse) => buildChartOption({ data, currency: data.currency, strategyLabel })!;
const seriesOf = (data: PortfolioResponse) => (build(data).option.series ?? []) as unknown as S[];
const find = (data: PortfolioResponse, name: string, type = 'line') =>
  seriesOf(data).find((s) => s.name === name && s.type === type);

describe('buildChartOption — 계좌 3선', () => {
  it('총재산·현금·평가액이 그대로 있다', () => {
    for (const n of ['추정 총 재산', '추정 잔여 현금', '보유 평가액']) {
      expect(find(두블록, n)).toBeTruthy();
    }
  });

  it('매매가 하나도 없으면 null (차트를 숨긴다)', () => {
    expect(buildChartOption({
      data: { ...두블록, tradesByDate: {} }, currency: 'USD', strategyLabel,
    })).toBeNull();
  });

  it('history 가 비면 null', () => {
    expect(buildChartOption({
      data: { ...두블록, history: [] }, currency: 'USD', strategyLabel,
    })).toBeNull();
  });
});

describe('전략(블록)별 선', () => {
  it('블록마다 평가액 선이 생긴다', () => {
    expect(find(두블록, '무한매수 V4 평가액')).toBeTruthy();
    expect(find(두블록, '밸류리밸런싱 VR 평가액')).toBeTruthy();
  });

  it('블록이 하나뿐이어도 그린다 — 국장에서 전략 선이 통째로 사라졌던 버그 (#378)', () => {
    expect(find(한블록, '무한매수 V4 평가액')).toBeTruthy();
  });

  it('totalValue 가 아니라 holdingsValue 를 그린다', () => {
    expect(find(두블록, '무한매수 V4 평가액')!.data).toEqual([500, 501]);
  });

  it('블록 선들의 합이 계좌 보유 평가액과 맞는다', () => {
    const v4 = find(두블록, '무한매수 V4 평가액')!.data as (number | null)[];
    const vr = find(두블록, '밸류리밸런싱 VR 평가액')!.data as (number | null)[];
    const 계좌평가 = find(두블록, '보유 평가액')!.data as number[];
    expect((v4[1] ?? 0) + (vr[1] ?? 0)).toBe(계좌평가[1]);
  });

  it('그 블록이 없던 날은 빈 값', () => {
    expect((find(두블록, '밸류리밸런싱 VR 평가액')!.data as unknown[])[0]).toBeNull();
  });

  it('점이 하나뿐인 블록은 점을 보인다 — 안 그러면 아무것도 안 그려진다', () => {
    expect(find(두블록, '밸류리밸런싱 VR 평가액')!.showSymbol).toBe(true);
    expect(find(두블록, '무한매수 V4 평가액')!.showSymbol).toBe(false);
  });
});

describe('마커', () => {
  it('마커는 그 블록 선 위(평가액)에 찍힌다', () => {
    const m = find(두블록, '무한매수 V4 평가액', 'scatter')!;
    expect((m.data[0] as { value: [string, number] }).value).toEqual(['2026-08-10', 500]);
  });

  it('블록이 하나뿐인 국장도 전략 선 위에 찍힌다 (#378)', () => {
    const m = find(한블록, '무한매수 V4 평가액', 'scatter');
    expect(m).toBeTruthy();
    // 계좌 총재산(1000)이 아니라 블록 평가액(600) 위다.
    expect((m!.data[0] as { value: [string, number] }).value).toEqual(['2026-08-10', 600]);
  });

  it('마커 series 이름이 선과 같다 — 범례가 두 배로 늘지 않고 함께 꺼진다', () => {
    const names = seriesOf(두블록).filter((s) => s.type === 'scatter').map((s) => s.name);
    expect(names).toContain('무한매수 V4 평가액');
  });

  it('매수만 ▲, 매수+매도 ■, 매도만은 ▲ 뒤집기', () => {
    expect((find(두블록, '무한매수 V4 평가액', 'scatter')!.data[0] as { symbol: string }).symbol).toBe('triangle');
    expect((find(두블록, '밸류리밸런싱 VR 평가액', 'scatter')!.data[0] as { symbol: string }).symbol).toBe('rect');
    const 매도 = find(한블록, '무한매수 V4 평가액', 'scatter')!.data[1] as { symbol: string; symbolRotate?: number };
    expect(매도.symbol).toBe('triangle');
    expect(매도.symbolRotate).toBe(180);
  });

  it('주인 없는 매매만 계좌 선에 「기타 매매」로 — 두 번 찍히지 않는다', () => {
    const 기타 = find(두블록, '기타 매매', 'scatter')!;
    expect(기타.data).toHaveLength(1);
    expect((기타.data[0] as { value: [string, number] }).value).toEqual(['2026-08-10', 1000]);
  });

  it('주인 없는 매매가 없으면 「기타 매매」 자체가 없다', () => {
    expect(find(한블록, '기타 매매', 'scatter')).toBeUndefined();
  });

  it('블록이 아예 없으면 모든 매매를 계좌 선에 「매매」로 찍는다(하위호환)', () => {
    const 블록없음: PortfolioResponse = { ...두블록, blocks: [] };
    const m = find(블록없음, '매매', 'scatter');
    expect(m!.data).toHaveLength(2);
  });

  it('마커에 portfolioId 가 실려 클릭 시 그 블록으로 갈 수 있다', () => {
    const m = find(두블록, '무한매수 V4 평가액', 'scatter')!;
    expect((m.data[0] as { portfolioId: string }).portfolioId).toBe('v4');
    expect((find(두블록, '기타 매매', 'scatter')!.data[0] as { portfolioId: string }).portfolioId).toBe('');
  });
});

describe('범례 — 화면이 HTML 로 그린다 (#378)', () => {
  it('ECharts 범례는 끈다 — 캔버스 안에 얹혀 x 축 날짜를 덮었다', () => {
    expect((build(두블록).option.legend as { show?: boolean }).show).toBe(false);
  });

  it('항목이 계열마다 하나씩, 순서대로 나온다', () => {
    expect(build(두블록).legend.map((l) => l.name)).toEqual([
      '추정 총 재산', '추정 잔여 현금', '보유 평가액',
      '무한매수 V4 평가액', '밸류리밸런싱 VR 평가액', '기타 매매',
    ]);
  });

  it('마커가 범례를 두 배로 늘리지 않는다', () => {
    const 이름 = build(두블록).legend.map((l) => l.name);
    expect(new Set(이름).size).toBe(이름.length);
  });

  it('블록마다 서로 다른 색을 준다', () => {
    const 블록색 = build(두블록).legend.slice(3, 5).map((l) => l.color);
    expect(new Set(블록색).size).toBe(2);
  });

  it('x 축 자리는 한 줄이면 충분하다 — 범례가 캔버스 밖이라', () => {
    const g = build(두블록).option.grid as { bottom: number };
    expect(g.bottom).toBeLessThanOrEqual(32);
  });
});

describe('범례 표식', () => {
  it('선이 있는 계열은 markerOnly 가 아니다', () => {
    const l = build(두블록).legend;
    expect(l.find((x) => x.name === '무한매수 V4 평가액')!.markerOnly).toBeUndefined();
  });

  it('마커만 있는 「기타 매매」는 markerOnly 다 — 표식이 실물과 달라 보이면 안 된다', () => {
    expect(build(두블록).legend.find((x) => x.name === '기타 매매')!.markerOnly).toBe(true);
  });
});

describe('마커 채움/테두리 구분 (#399)', () => {
  const scatterData = (data: PortfolioResponse, name: string) => {
    const s = seriesOf(data).find((x) => x.name === name && x.type === 'scatter')!;
    return s.data as Array<{ symbol: string; symbolRotate?: number; itemStyle: { color: string; borderColor: string } }>;
  };

  it('매수만 = 채운 삼각형 (색이 투명 아님)', () => {
    // 두블록: 무한매수 V4 의 2026-08-10 은 매수만(stats(2,0)).
    const it = scatterData(두블록, '무한매수 V4 평가액')[0];
    expect(it.symbol).toBe('triangle');
    expect(it.symbolRotate).toBeUndefined();
    expect(it.itemStyle.color).not.toBe('transparent'); // 채움
    expect(it.itemStyle.color).toBe(it.itemStyle.borderColor);
  });

  it('매수+매도 = 테두리만 사각형 (채움 투명)', () => {
    // VR 의 2026-08-11 은 매수+매도(stats(1,1)).
    const it = scatterData(두블록, '밸류리밸런싱 VR 평가액')[0];
    expect(it.symbol).toBe('rect');
    expect(it.itemStyle.color).toBe('#ffffff'); // 테두리만(속은 흰색)
    expect(it.itemStyle.borderColor).not.toBe('transparent');
  });

  it('매도만 = 테두리만 아래 삼각형', () => {
    // 한블록: 국장 2026-08-11 은 매도만(stats(0,2)).
    const it = scatterData(한블록, '무한매수 V4 평가액').find((x) => x.symbolRotate === 180)!;
    expect(it.symbol).toBe('triangle');
    expect(it.itemStyle.color).toBe('#ffffff'); // 테두리만(속은 흰색)
  });
});
