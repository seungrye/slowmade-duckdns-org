// @vitest-environment jsdom
// Table paging on the trade detail screen (#184).
//
// The maths is `components/pager.test.ts`'s concern. This checks that **25 rows really appear on screen**,
// that pressing the button brings the next batch, and that a date arrived at through a marker opens on its page.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// The chart is not this test's concern - it is heavy and jsdom cannot draw a canvas.
vi.mock('echarts-for-react', () => ({ default: () => <div data-testid="chart" /> }));
vi.mock('@/hooks/use-mobile', () => ({ useMobile: () => false }));

import PortfolioDetailClient from './portfolio-detail-client';

const trade = (i: number, date: string) => ({
  ticker: 'TQQQ', action: (i % 2 ? 'sell' : 'buy') as 'buy' | 'sell',
  qty: 1, cumulativeQty: i, price: 100 + i, amount: 100 + i,
  date, strategy: 'infinite_v4',
});

// 60 records, a day apart. The server sends them ascending and the UI reverses them so the newest is on top.
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

/** The number of data rows in one table (excluding the header). */
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

  // This screen is reached by clicking a chart marker. Blindly showing page 1 hides the trade that was clicked.
  it('center 날짜가 든 페이지로 연다 — 마커를 눌러 들어온 매매가 보여야 한다', () => {
    // A date past the 25th in the newest-first list is chosen.
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

// #374 - separating by portfolio (block). The US account has two blocks, and combining them is unreadable.
describe('블록(전략) 구분', () => {
  const BLOCKS = [
    { portfolioId: 'aaaaaaaaaaaaaaaaaaaaaaaa', strategy: 'infinite_v4' },
    { portfolioId: 'bbbbbbbbbbbbbbbbbbbbbbbb', strategy: 'value_rebalancing' },
  ];

  it('블록이 둘 이상이면 탭이 나온다 — 전체 + 전략별', () => {
    renderPage({ blocks: BLOCKS });
    expect(screen.getByRole('link', { name: '전체' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '무한매수 V4' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '밸류리밸런싱 VR' })).toBeTruthy();
  });

  it('탭 링크가 env·통화·center·portfolioId 를 실어 나른다', () => {
    renderPage({ blocks: BLOCKS, center: '2026-06-05' });
    const href = screen.getByRole('link', { name: '무한매수 V4' }).getAttribute('href')!;
    expect(href).toContain('env=paper-50194613');
    expect(href).toContain('currency=KRW');
    expect(href).toContain('center=2026-06-05');
    expect(href).toContain('portfolioId=aaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('「전체」 탭 링크에는 portfolioId 가 없다', () => {
    renderPage({ blocks: BLOCKS });
    expect(screen.getByRole('link', { name: '전체' }).getAttribute('href')).not.toContain('portfolioId');
  });

  it('고른 블록 탭이 표시된다', () => {
    renderPage({ blocks: BLOCKS, portfolioId: 'bbbbbbbbbbbbbbbbbbbbbbbb' });
    expect(screen.getByRole('link', { name: '밸류리밸런싱 VR' }).className).toContain('border-blue-600');
    expect(screen.getByRole('link', { name: '전체' }).className).not.toContain('border-blue-600');
  });

  it('블록이 하나뿐이면 탭을 안 그린다 — 「전체」와 같아 군더더기다', () => {
    renderPage({ blocks: [BLOCKS[0]] });
    expect(screen.queryByRole('link', { name: '전체' })).toBeNull();
  });

  it('매매 기록 표에 전략 열이 있다', () => {
    renderPage({ blocks: BLOCKS });
    expect(screen.getByRole('columnheader', { name: '전략' })).toBeTruthy();
    expect(screen.getAllByText('무한매수 V4').length).toBeGreaterThan(0);
  });
});

// #373 - a reconstructed row knows only the holdings value. Showing the rest as numbers would be a lie.
describe('되살린(backfilled) 행 표시', () => {
  const 되살림 = [
    { dateStr: '2026-07-01', totalValue: 900, cash: 0, holdingsValue: 900, cumulativePnl: 0, backfilled: true },
    { dateStr: '2026-07-02', totalValue: 1000, cash: 400, holdingsValue: 600, cumulativePnl: 12 },
  ];

  it('되살린 행의 현금·총재산·누적손익은 — 로 나온다', () => {
    renderPage({ history: 되살림 });
    const row = screen.getByText('2026-07-01').closest('tr')!;
    const cells = [...row.querySelectorAll('td')].map((c) => c.textContent);
    expect(cells[1]).toBe('—'); // total assets
    expect(cells[2]).toBe('—'); // cash
    expect(cells[3]).toContain('900'); // the holdings value is measured, so it stands
    expect(cells[4]).toBe('—'); // cumulative P&L
  });

  it('라이브 행은 종전대로 숫자가 나온다', () => {
    renderPage({ history: 되살림 });
    const row = screen.getByText('2026-07-02').closest('tr')!;
    const cells = [...row.querySelectorAll('td')].map((c) => c.textContent);
    expect(cells[1]).toContain('1,000');
    expect(cells[2]).toContain('400');
    expect(cells[4]).toContain('12');
  });

  it('되살린 행에는 표시가 붙는다', () => {
    renderPage({ history: 되살림 });
    expect(screen.getByText('되살림')).toBeTruthy();
  });
});

// #382 - reproducing what was measured. A live **block** snapshot has no cumulativePnl at all.
//   close-sync writes only totalValue/cash/holdingsValue on a block row (realized P&L is computed only per
//   account), and getPortfolioData's block select does not project that field either.
//   Passing that row straight into formatMoney killed the whole page with `undefined.toLocaleString()`.
//   /admin/portfolio/detail?...&portfolioId=6a5a1a98... would not open at all.
describe('모르는 값이 든 스냅샷 행 (#382)', () => {
  const 라이브블록행 = {
    dateStr: '2026-09-01', totalValue: 96379.1577, cash: 51345.201, holdingsValue: 45033.9567,
    // cumulativePnl 없음 — 실제 DB 문서가 이렇다
  } as unknown as { dateStr: string; totalValue: number; cash: number; holdingsValue: number; cumulativePnl: number };

  it('cumulativePnl 이 없어도 렌더가 죽지 않는다', () => {
    expect(() => renderPage({ history: [라이브블록행] })).not.toThrow();
  });

  it('모르는 값은 — 로 낸다 (0 으로 꾸미지 않는다)', () => {
    renderPage({ history: [라이브블록행] });
    const row = screen.getByText('2026-09-01').closest('tr')!;
    const cells = [...row.querySelectorAll('td')].map((c) => c.textContent);
    expect(cells[1]).toContain('96,379'); // total assets - a present value stands
    expect(cells[2]).toContain('51,345'); // cash - a present value stands
    expect(cells[3]).toContain('45,034'); // the holdings value (KRW is rounded)
    expect(cells[4]).toBe('—');           // cumulative P&L - unknown per block
  });

  it('다른 숫자가 비어도 그 칸만 — 가 되고 나머지는 살아 있다', () => {
    const 구멍 = { dateStr: '2026-09-02', holdingsValue: 1000 } as never;
    expect(() => renderPage({ history: [구멍] })).not.toThrow();
    const row = screen.getByText('2026-09-02').closest('tr')!;
    const cells = [...row.querySelectorAll('td')].map((c) => c.textContent);
    expect(cells[1]).toBe('—');
    expect(cells[2]).toBe('—');
    expect(cells[3]).toContain('1,000');
  });

  it('매매 기록의 수량이 비어도 죽지 않는다', () => {
    const 구멍매매 = {
      ticker: 'TQQQ', action: 'buy' as const, date: '2026-09-01', strategy: 'infinite_v4',
    } as never;
    expect(() => renderPage({ trades: [구멍매매], history: [] })).not.toThrow();
  });
});
