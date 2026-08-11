// @vitest-environment jsdom
//
// #85 — 시장 탭을 바꾼 뒤 종목을 제거하면 엉뚱한 목록이 바뀌던 버그.
//
// `setSelected` 는 useState setter 가 아니라 market 에 따라 갈리는 파생값이다:
//     const setSelected = market === "KR" ? setSelectedKr : setSelectedUs;
// 그런데 removeTicker 의 useCallback 의존성이 [] 라, 최초 market 의 setter 를 클로저에
// 가둔 채 다시 만들어지지 않았다. KR 로 시작해 US 로 옮긴 뒤 제거를 누르면
// setSelectedKr 이 불려 **US 종목이 지워지지 않는다.**
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  // 국장 탭에서 시작하고, 두 시장에 각각 한 종목이 선택돼 있다.
  useSearchParams: () => new URLSearchParams("market=kr&kr=005930&us=AAPL"),
}));
// 차트는 이 테스트의 관심사가 아니다.
vi.mock("echarts-for-react", () => ({ default: () => null }));

import MultiChartClient from "./multi-chart-client";

const stocks = [
  { ticker: "005930", name: "삼성전자", market: "KR" as const },
  { ticker: "AAPL", name: "Apple", market: "US" as const },
];

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: [], prices: [], trades: [] }),
  }) as unknown as typeof fetch;
});

describe("MultiChartClient — 시장 전환 후 종목 제거", () => {
  it("미장으로 옮긴 뒤 제거하면 미장 종목이 지워진다", async () => {
    render(<MultiChartClient stocks={stocks} />);

    // 국장 탭에서 시작 — 삼성전자 칩이 있다.
    expect(screen.getByLabelText("005930 제거")).toBeTruthy();

    // 미장 탭으로 전환 — AAPL 칩이 보인다.
    fireEvent.click(screen.getByLabelText("미장 탭"));
    expect(screen.getByLabelText("AAPL 제거")).toBeTruthy();

    // 제거를 누르면 AAPL 이 사라져야 한다.
    fireEvent.click(screen.getByLabelText("AAPL 제거"));
    expect(screen.queryByLabelText("AAPL 제거")).toBeNull();
  });

  it("미장에서 제거해도 국장 선택은 남는다", () => {
    render(<MultiChartClient stocks={stocks} />);
    fireEvent.click(screen.getByLabelText("미장 탭"));
    fireEvent.click(screen.getByLabelText("AAPL 제거"));

    // 국장으로 돌아오면 삼성전자는 그대로여야 한다 —
    // 버그가 있으면 setSelectedKr 이 불려 이쪽이 지워진다.
    fireEvent.click(screen.getByLabelText("국장 탭"));
    expect(screen.getByLabelText("005930 제거")).toBeTruthy();
  });
});
