// /api/my/trading/export - route tests (#181).
//
// Only the owner sees the trade history. The conversion itself is verified on the `export-csv` side, so this
// concentrates on authorisation, target validation and the response headers.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/lib/require-owner', () => ({ requireOwner: vi.fn() }));

// vi.mock is hoisted and runs at the top of the file - the values the mock uses are hoisted with it.
const h = vi.hoisted(() => {
  const chain = (rows: unknown[]) => ({
    find: () => ({ sort: () => ({ limit: () => ({ lean: async () => rows }) }) }),
  });
  return { chain, ORDERS: [] as unknown[] };
});
const ORDERS = h.ORDERS;
vi.mock('@/models/trading-order-log', () => ({ default: h.chain(h.ORDERS) }));
vi.mock('@/models/portfolio-history', () => ({ default: h.chain([]) }));
vi.mock('@/models/trading-run', () => ({ default: h.chain([]) }));
vi.mock('@/models/stock-trade', () => ({ default: h.chain([]) }));

import { GET } from './route';
import { requireOwner } from '@/lib/require-owner';

const makeRequest = (qs: string): NextRequest =>
  new Request(`http://localhost/api/my/trading/export${qs}`) as unknown as NextRequest;

describe('GET /api/my/trading/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ email: 'owner@test' });
    ORDERS.length = 0;
    ORDERS.push({
      createdAt: new Date('2026-08-18T01:23:45.000Z'),
      envKey: 'paper-50194613', market: 'us', strategy: 'infinite_v4',
      symbol: 'TQQQ', side: 'buy', qty: 3, price: 71.25, dryRun: false,
    });
  });

  it('작성자가 아니면 404 — 매매 내역의 존재조차 알리지 않는다', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(requireOwner).mockResolvedValue(NextResponse.json({ message: 'Not found' }, { status: 404 }));
    const res = await GET(makeRequest('?dataset=orders'));
    expect(res.status).toBe(404);
  });

  it('인가가 DB 조회보다 먼저다', async () => {
    const { connectToDB } = await import('@/lib/db');
    const { NextResponse } = await import('next/server');
    vi.mocked(requireOwner).mockResolvedValue(NextResponse.json({ message: 'Not found' }, { status: 404 }));
    await GET(makeRequest('?dataset=orders'));
    expect(connectToDB).not.toHaveBeenCalled();
  });

  it('모르는 대상은 400 — 무엇을 쓸 수 있는지 함께 알려준다', async () => {
    const res = await GET(makeRequest('?dataset=nope'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.available).toContain('orders');
  });

  it('대상을 안 주면 400', async () => {
    expect((await GET(makeRequest(''))).status).toBe(400);
  });

  it('CSV 를 내려준다 — 첨부 파일로, 한글 이름과 함께', async () => {
    const res = await GET(makeRequest('?dataset=orders'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    const cd = res.headers.get('Content-Disposition') ?? '';
    expect(cd).toContain('attachment');
    // A Korean filename travels as RFC 5987.
    expect(cd).toContain("filename*=UTF-8''");
    expect(decodeURIComponent(cd)).toContain('매매기록-주문로그-');
  });

  it('실제 바이트가 UTF-8 BOM 으로 시작한다 — 엑셀 한글 깨짐 방지', async () => {
    // `Response.text()` conventionally strips a leading BOM. So it inspects **the bytes** rather than the
    // characters - otherwise the test would pass even with the BOM missing.
    const buf = new Uint8Array(await (await GET(makeRequest('?dataset=orders'))).arrayBuffer());
    expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('머리글과 값이 담긴다', async () => {
    const text = await (await GET(makeRequest('?dataset=orders'))).text();
    expect(text).toContain('시각,계정,시장,전략,종목');
    expect(text).toContain('TQQQ');
  });

  it('매매 내역이라 캐시에 남기지 않는다', async () => {
    const res = await GET(makeRequest('?dataset=orders'));
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });

  it('행 수를 헤더로 알려준다 — 받은 파일이 온전한지 대조할 수 있게', async () => {
    const res = await GET(makeRequest('?dataset=orders'));
    expect(res.headers.get('X-Export-Rows')).toBe('1');
    // Below the cap there must be no truncation marker.
    expect(res.headers.get('X-Export-Truncated')).toBeNull();
  });

  it('자료가 없어도 머리글만 있는 CSV 를 준다 — 빈 파일은 실패와 구분이 안 된다', async () => {
    ORDERS.length = 0;
    const text = await (await GET(makeRequest('?dataset=orders'))).text();
    expect(text).toContain('시각,계정');
    expect((await GET(makeRequest('?dataset=orders'))).headers.get('X-Export-Rows')).toBe('0');
  });

  it.each(['orders', 'portfolio', 'runs', 'trades'])('%s 대상을 받는다', async (id) => {
    expect((await GET(makeRequest(`?dataset=${id}`))).status).toBe(200);
  });
});
