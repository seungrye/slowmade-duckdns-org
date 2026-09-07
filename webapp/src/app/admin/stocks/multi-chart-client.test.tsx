// @vitest-environment jsdom
//
// #85 - a bug where removing a symbol after switching market tabs changed the wrong list.
//
// `setSelected` is not a useState setter but a derived value that branches on market:
//     const setSelected = market === "KR" ? setSelectedKr : setSelectedUs;
// But removeTicker's useCallback had [] as its dependencies, so it trapped the initial market's setter in its
// closure and was never rebuilt. Starting on KR, moving to US and pressing remove called
// setSelectedKr, so **the US symbol was not removed.**
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  // It starts on the KRX tab with one symbol selected in each market.
  useSearchParams: () => new URLSearchParams("market=kr&kr=005930&us=AAPL"),
}));
// The chart is not this test's concern.
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

    // Starting on the KRX tab - the Samsung Electronics chip is there.
    expect(screen.getByLabelText("005930 제거")).toBeTruthy();

    // Switching to the US tab - the AAPL chip appears.
    fireEvent.click(screen.getByLabelText("미장 탭"));
    expect(screen.getByLabelText("AAPL 제거")).toBeTruthy();

    // Pressing remove must make AAPL disappear.
    fireEvent.click(screen.getByLabelText("AAPL 제거"));
    expect(screen.queryByLabelText("AAPL 제거")).toBeNull();
  });

  it("미장에서 제거해도 국장 선택은 남는다", () => {
    render(<MultiChartClient stocks={stocks} />);
    fireEvent.click(screen.getByLabelText("미장 탭"));
    fireEvent.click(screen.getByLabelText("AAPL 제거"));

    // Returning to KRX, Samsung Electronics must still be there -
    // with the bug, setSelectedKr is called and this side is wiped.
    fireEvent.click(screen.getByLabelText("국장 탭"));
    expect(screen.getByLabelText("005930 제거")).toBeTruthy();
  });
});
