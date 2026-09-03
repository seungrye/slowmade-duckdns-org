// @vitest-environment jsdom
// 오늘 이미 확인한 타로는 다음날까지 뒤집힌 채로 유지된다 (#388 후속).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

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

describe('사주 탭 — 한자 병기·뜻 (#393)', () => {
  const withSaju = () => ({
    data: {
      dateKey: '2026-09-03', seen: true, orientation: 'up',
      reading: '타로 풀이', readingSource: 'llm',
      card: { nameKr: '별', nameEn: 'The Star', keywords: ['희망'], imageUrl: 'x' },
      saju: {
        pillars: {
          year: { ganzhi: '癸酉', gan: '癸', zhi: '酉', ganKr: '계', zhiKr: '유', ganEl: '수', zhiEl: '금' },
          month: { ganzhi: '戊午', gan: '戊', zhi: '午', ganKr: '무', zhiKr: '오', ganEl: '토', zhiEl: '화' },
          day: { ganzhi: '丁卯', gan: '丁', zhi: '卯', ganKr: '정', zhiKr: '묘', ganEl: '화', zhiEl: '목' },
          time: null,
        },
        dayGanKr: '정', dayEl: '화', elements: { 목: 1, 화: 2, 토: 1, 금: 1, 수: 1 },
        iljin: { ganzhi: '庚辰', gan: '庚', zhi: '辰', ganKr: '경', zhiKr: '진', ganEl: '금' },
        relation: { key: '재성', meaning: '재물·성취·현실' },
        reading: '오늘은 성취의 기운이 도는 하루예요.', readingSource: 'llm', hasBirthTime: false,
      },
    },
  });

  beforeEach(() => vi.restoreAllMocks());

  it('사주 탭을 누르면 한자와 한글이 함께 보인다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => withSaju() }));
    render(<TodayFortuneSection />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: '사주' }));
    // 일주의 한자(丁)와 한글(정)이 함께
    expect(screen.getAllByText('丁').length).toBeGreaterThan(0);
    expect(screen.getAllByText('정').length).toBeGreaterThan(0);
    expect(screen.getByText('오늘은 성취의 기운이 도는 하루예요.')).toBeInTheDocument();
  });

  it('생일 없으면 사주 탭에 등록 안내', async () => {
    const noSaju = withSaju();
    (noSaju.data as { saju: unknown }).saju = null;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => noSaju }));
    render(<TodayFortuneSection />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: '사주' }));
    expect(screen.getByText(/생일 등록하러 가기/)).toBeInTheDocument();
  });
});
