// @vitest-environment jsdom
// 매매 상세 화면의 표 페이징 (#184).
//
// 계산은 `components/pager.test.ts` 가 본다. 여기서는 **실제로 화면에 25행만 나오는지**,
// 버튼을 눌러 다음 묶음이 오는지, 그리고 마커로 들어온 날짜가 든 페이지로 열리는지를 본다.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// 차트는 이 테스트의 관심사가 아니다 — 무겁고 jsdom 에서 캔버스를 못 그린다.
vi.mock('echarts-for-react', () => ({ default: () => <div data-testid="chart" /> }));
vi.mock('@/hooks/use-mobile', () => ({ useMobile: () => false }));

import PortfolioDetailClient from './portfolio-detail-client';

const trade = (i: number, date: string) => ({
  ticker: 'TQQQ', action: (i % 2 ? 'sell' : 'buy') as 'buy' | 'sell',
  qty: 1, cumulativeQty: i, price: 100 + i, amount: 100 + i,
  date, strategy: 'infinite_v4',
});

// 날짜를 하루씩 늘려 60건. 서버는 오름차순으로 주고 화면이 뒤집어 최신을 위로 올린다.
const TRADES = Array.from({ length: 60 }, (_, i) =>
  trade(i, `2026-06-${String((i % 28) + 1).padStart(2, '0')}`),
);
const HISTORY = Array.from({ length: 40 }, (_, i) => ({
  dateStr: `2026-07-${String((i % 28) + 1).padStart(2, '0')}`,
  totalValue: 1000 + i, cash: 500, holdingsValue: 500 + i, cumulativePnl: i - 20,
}));

function renderPage(over: Record<string, unknown> = {}) {
  return render(
    <PortfolioDetailClient
      env="paper-50194613"
      currency="KRW"
      center={null}
      trades={TRADES}
      pricesByTicker={{}}
      names={{ TQQQ: '프로셰어즈' }}
      history={HISTORY}
      {...over}
    />,
  );
}

/** 표 하나의 데이터 행 수(머리글 제외). */
function bodyRows(tableIndex: number): number {
  const table = document.querySelectorAll('table')[tableIndex];
  return table.querySelectorAll('tbody tr').length;
}

describe('매매 상세 — 표 페이징', () => {
  it('매매 기록을 한 번에 다 그리지 않는다 — 25행', () => {
    renderPage();
    expect(bodyRows(0)).toBe(25);
  });

  it('날짜별 포트폴리오도 25행', () => {
    renderPage();
    expect(bodyRows(1)).toBe(25);
  });

  it('총 건수를 보여 준다 — 잘려 보이는 게 아니라 나뉜 것임을 알게', () => {
    renderPage();
    expect(screen.getByText(/총 60건/)).toBeTruthy();
    expect(screen.getByText(/총 40건/)).toBeTruthy();
  });

  it('"다음" 을 누르면 다음 묶음이 온다', () => {
    renderPage();
    const first = document.querySelectorAll('table')[0].querySelector('tbody tr')?.textContent;
    fireEvent.click(screen.getAllByRole('button', { name: /다음/ })[0]);
    const after = document.querySelectorAll('table')[0].querySelector('tbody tr')?.textContent;
    expect(after).not.toBe(first);
    expect(bodyRows(0)).toBe(25);
  });

  it('마지막 페이지는 남은 만큼만 — 60건이면 10행', () => {
    renderPage();
    const next = () => fireEvent.click(screen.getAllByRole('button', { name: /다음/ })[0]);
    next(); next();
    expect(bodyRows(0)).toBe(10);
  });

  it('첫 페이지에서 "이전" 은 눌리지 않는다', () => {
    renderPage();
    expect((screen.getAllByRole('button', { name: /이전/ })[0] as HTMLButtonElement).disabled).toBe(true);
  });

  // 이 화면은 차트 마커를 눌러 들어온다. 무턱대고 1페이지를 보여 주면 누른 매매가 안 보인다.
  it('center 날짜가 든 페이지로 연다 — 마커를 눌러 들어온 매매가 보여야 한다', () => {
    // 최신순으로 뒤집힌 목록에서 25번째 이후에 있는 날짜를 고른다.
    const desc = [...TRADES].reverse();
    const target = desc[30].date;
    renderPage({ center: target });
    const shown = document.querySelectorAll('table')[0].textContent ?? '';
    expect(shown).toContain(target);
  });

  it('center 행에 표시를 준다 — 왜 그 페이지가 열렸는지 알게', () => {
    const desc = [...TRADES].reverse();
    renderPage({ center: desc[30].date });
    const marked = document.querySelectorAll('table')[0].querySelectorAll('tbody tr.bg-yellow-50');
    expect(marked.length).toBeGreaterThan(0);
  });

  it('한 페이지에 다 들어가면 페이저가 아예 안 보인다', () => {
    renderPage({ trades: TRADES.slice(0, 10), history: HISTORY.slice(0, 5) });
    expect(screen.queryByText(/총 10건/)).toBeNull();
    expect(screen.queryAllByRole('button', { name: /다음/ })).toHaveLength(0);
  });

  it('자료가 없어도 안내 문구가 나온다', () => {
    renderPage({ trades: [], history: [] });
    expect(screen.getByText('매매 기록이 없습니다.')).toBeTruthy();
    expect(screen.getByText('포트폴리오 기록이 없습니다.')).toBeTruthy();
  });
});
