// /api/my/trading/export/sheets — 라우트 테스트 (#181 2단계).
//
// 값 변환은 `sheets.test.ts` 가 본다. 여기서는 인가·상태 분기·시트 호출 여부에 집중한다.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  const chain = (rows: unknown[]) => ({
    find: () => ({ sort: () => ({ limit: () => ({ lean: async () => rows }) }) }),
  });
  return { chain, orders: [] as unknown[], flag: { sheetsExport: true } };
});

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/lib/require-owner', () => ({ requireOwner: vi.fn() }));
vi.mock('@/lib/google/oauth', () => ({ getAccessToken: vi.fn() }));
vi.mock('@/lib/google/sheets', async (orig) => ({
  ...(await orig<typeof import('@/lib/google/sheets')>()),
  createSpreadsheet: vi.fn(),
}));
vi.mock('@/lib/env', () => ({ env: { google: h.flag } }));
vi.mock('@/models/trading-order-log', () => ({ default: h.chain(h.orders) }));
vi.mock('@/models/portfolio-history', () => ({ default: h.chain([]) }));
vi.mock('@/models/trading-run', () => ({ default: h.chain([]) }));
vi.mock('@/models/stock-trade', () => ({ default: h.chain([]) }));

import { POST } from './route';
import { requireOwner } from '@/lib/require-owner';
import { getAccessToken } from '@/lib/google/oauth';
import { createSpreadsheet } from '@/lib/google/sheets';

const req = () => new Request('http://localhost/api/my/trading/export/sheets', { method: 'POST' }) as unknown as NextRequest;
const notOwner = async () => {
  const { NextResponse } = await import('next/server');
  vi.mocked(requireOwner).mockResolvedValue(NextResponse.json({ message: 'Not found' }, { status: 404 }));
};

describe('POST /api/my/trading/export/sheets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.flag.sheetsExport = true;
    h.orders.length = 0;
    h.orders.push({ symbol: 'TQQQ', qty: 3, price: 71.25 });
    vi.mocked(requireOwner).mockResolvedValue({ email: 'owner@test' });
    vi.mocked(getAccessToken).mockResolvedValue('tok');
    vi.mocked(createSpreadsheet).mockResolvedValue('https://docs.google.com/spreadsheets/d/abc/edit');
  });

  it('작성자가 아니면 404', async () => {
    await notOwner();
    expect((await POST(req())).status).toBe(404);
  });

  it('인가가 토큰 조회보다 먼저다 — 남의 요청으로 구글을 부르지 않는다', async () => {
    await notOwner();
    await POST(req());
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it('기능이 꺼져 있으면 503 — 무엇이 빠졌는지 알려준다', async () => {
    h.flag.sheetsExport = false;
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect((await res.json()).message).toContain('GOOGLE_SHEETS_EXPORT');
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it('구글 동의가 없으면 409 — 사용자가 할 일을 알려준다', async () => {
    vi.mocked(getAccessToken).mockResolvedValue(null);
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect((await res.json()).message).toContain('다시 로그인');
    expect(createSpreadsheet).not.toHaveBeenCalled();
  });

  it('정상이면 시트 주소를 준다', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).url).toContain('docs.google.com');
  });

  it('탭 넷을 한 시트에 만든다 — 링크가 하나여야 한다', async () => {
    await POST(req());
    const [, , tabs] = vi.mocked(createSpreadsheet).mock.calls[0];
    expect(tabs.map((t) => t.title)).toEqual(['주문로그', '포트폴리오이력', '실행이력', '체결기록']);
  });

  it('탭마다 머리글이 들어간다 — 자료가 없어도 빈 탭이 아니다', async () => {
    await POST(req());
    const [, , tabs] = vi.mocked(createSpreadsheet).mock.calls[0];
    expect(tabs.every((t) => t.values.length >= 1)).toBe(true);
    expect(tabs[0].values[0]).toContain('종목');
  });

  it('탭별 행 수를 함께 알려준다 — 받은 시트가 온전한지 대조할 수 있게', async () => {
    const body = await (await POST(req())).json();
    expect(body.rows.orders).toBe(1);
    expect(body.rows.runs).toBe(0);
  });

  it('구글이 거절하면 502 와 이유 — "API 미사용"과 "권한 없음"은 대응이 다르다', async () => {
    vi.mocked(createSpreadsheet).mockRejectedValue(new Error('구글 시트 API 오류 403: PERMISSION_DENIED'));
    const res = await POST(req());
    expect(res.status).toBe(502);
    expect((await res.json()).message).toContain('403');
  });
});
