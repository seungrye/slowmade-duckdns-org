// @vitest-environment jsdom
//
// 매매 상세 차트가 **모바일에서 정말 30일 창으로 열리는지** (#370).
//
// 코드에는 `windowStartDate(allDates, isMobile)` 이 있는데 실제로는 더 넓게 보인다는
// 신고가 있었다. 의도만 있고 안 먹는 자리를 짚으려고 옵션을 직접 들여다본다.
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

/** ReactECharts 에 넘어간 option 을 그대로 붙잡는다. */
const 받은옵션: Record<string, unknown>[] = [];
vi.mock("echarts-for-react", () => ({
  default: (p: { option: Record<string, unknown> }) => {
    받은옵션.push(p.option);
    return <div data-testid="chart" />;
  },
}));
vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => true }));

import PortfolioDetailClient from "./portfolio-detail-client";

/** 2년치 일봉 — 창을 안 잡으면 2년이 통째로 보인다. */
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
