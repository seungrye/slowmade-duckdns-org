// @vitest-environment jsdom
// 오늘 이미 확인한 타로는 다음날까지 뒤집힌 채로 유지된다 (#388 후속).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

vi.mock('next-auth/react', () => ({ useSession: () => ({ status: 'authenticated' }) }));

import TodayFortuneSection from './today-fortune.section';

const fortune = (seen: boolean) => ({
  data: {
    dateKey: '2026-09-03', seen, orientation: 'up',
    reading: '오늘은 희망이 스미는 하루예요.', readingSource: 'llm',
    card: { nameKr: '별', nameEn: 'The Star', keywords: ['희망'], imageUrl: 'x' },
  },
});

describe('오늘의 운세 섹션 — 확인 유지 (#388)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('이미 본 카드(seen=true)면 클릭 없이 풀이가 바로 보인다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => fortune(true) }));
    render(<TodayFortuneSection />);
    await act(async () => {});
    expect(screen.getByText('오늘은 희망이 스미는 하루예요.')).toBeInTheDocument();
  });

  it('아직 안 본 카드(seen=false)면 뒤집기 안내가 보이고 풀이는 감춰진다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => fortune(false) }));
    render(<TodayFortuneSection />);
    await act(async () => {});
    expect(screen.getByText('뒤집어 보기')).toBeInTheDocument();
    expect(screen.queryByText('오늘은 희망이 스미는 하루예요.')).toBeNull();
  });
});
