// @vitest-environment jsdom
//
// Whether the trade detail chart **really opens with a 30-day window on mobile** (#370).
//
// The code has `windowStartDate(allDates, isMobile)`, yet it was reported as showing wider in practice.
// The options are inspected directly to pin the place where the intent exists but does not take effect.
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

/** Captures the option passed to ReactECharts as it stands. */
const 받은옵션: Record<string, unknown>[] = [];
vi.mock("echarts-for-react", () => ({
  default: (p: { option: Record<string, unknown> }) => {
    받은옵션.push(p.option);
    return <div data-testid="chart" />;
  },
}));
vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => true }));

import PortfolioDetailClient from "./portfolio-detail-client";

/** Two years of daily bars - without a window, all two years are visible. */
const 날짜들 = Array.from({ length: 500 }, (_, i) => {
  const d = new Date(Date.UTC(2025, 0, 1) + i * 86_400_000);
  return d.toISOString().slice(0, 10);
});
const PRICES = { TQQQ: 날짜들.map((date, i) => ({ date, close: 100 + (i % 20) })) };

function 옵션(center: string | null = null) {
  받은옵션.length = 0;
  render(
    <PortfolioDetailClient
      env="paper-50194613" currency="USD" center={center}
      trades={[]} pricesByTicker={PRICES} names={{ TQQQ: "TQQQ" }} history={[]}
    />,
  );
  return 받은옵션[받은옵션.length - 1];
}

const 줌 = (o: Record<string, unknown>) =>
  (o.dataZoom as { startValue?: string; endValue?: string }[])[0];

const 일수 = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;

describe("매매 상세 — 모바일 창 (#370)", () => {
  it("center 가 없으면 마지막 날부터 30일 창으로 연다", () => {
    const z = 줌(옵션(null));
    expect(z.startValue, "startValue 가 안 잡혔다 — 전체가 보인다").toBeTruthy();
    expect(일수(z.startValue!, 날짜들[날짜들.length - 1])).toBe(30);
  });

  it("center 가 있으면 그 날짜를 품는 30일 창", () => {
    const z = 줌(옵션("2025-06-15"));
    expect(z.startValue).toBeTruthy();
    expect(z.endValue).toBeTruthy();
    expect(일수(z.startValue!, z.endValue!)).toBe(30);
  });

  it("2년치를 다 보여주지 않는다 — 이게 신고된 증상이다", () => {
    const z = 줌(옵션(null));
    expect(일수(z.startValue ?? 날짜들[0], 날짜들[날짜들.length - 1])).toBeLessThan(60);
  });
});
