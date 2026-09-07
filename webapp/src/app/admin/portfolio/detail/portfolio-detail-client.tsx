"use client";

import { envLabel } from "@/lib/env-label";

import { useMemo, useState } from "react";
import { useMobile } from "@/hooks/use-mobile";
import { windowAround, windowStartDate } from "../recent-points";
import { strategyLabel } from "@/types/trading-marker";
import Link from "next/link";
import ReactECharts from "echarts-for-react";
import Pager, { pageOfIndex, pageSlice } from "@/components/pager";
import type { EChartsOption } from "echarts";

/** Rows per page. Matched to the order log on the monitor screen (#184). */
const PAGE_SIZE = 25;

type Env = string;
type Currency = "KRW" | "USD";

type Trade = {
  ticker: string;
  action: "buy" | "sell";
  qty?: number;
  cumulativeQty?: number;
  price?: number;
  amount?: number;
  date: string;
  strategy: string;
};
type HistoryPoint = {
  dateStr: string;
  /**
   * A block snapshot **has missing values** (#382). close-sync writes only
   * totalValue/cash/holdingsValue on a block row - realized P&L is computed only per account.
   * So everything is optional. A missing value is shown as `—` rather than dressed up as 0.
   */
  totalValue?: number;
  cash?: number;
  holdingsValue?: number;
  cumulativePnl?: number;
  /** A row reconstructed from trades and daily bars (#373). Cash, total assets and cumulative P&L are unknown and shown as `—`. */
  backfilled?: boolean;
};

type Props = {
  env: Env;
  currency: Currency;
  center: string | null;
  trades: Trade[];
  pricesByTicker: Record<string, { date: string; close: number }[]>;
  names: Record<string, string>;
  history: HistoryPoint[];
  /** This account and market's blocks - the tabs at the top (#374). */
  blocks?: { portfolioId: string; strategy: string }[];
  /** The currently selected block. null means all. */
  portfolioId?: string | null;
};

// The per-symbol colour palette - the close, the 20-day and the 60-day MA share a colour and differ by line style.
const PALETTE = [
  "#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de",
  "#3ba272", "#fc8452", "#9a60b4", "#ea7ccc", "#c14953",
  "#2f4b7c", "#665191", "#a05195", "#d45087", "#f95d6a",
  "#ff7c43", "#ffa600", "#488f31", "#de425b", "#69b3a2",
];

/**
 * One snapshot cell. `—` when the value is missing or not a number.
 *
 * It used to be passed straight into formatMoney, killing **the whole page** with
 * `undefined.toLocaleString()` (#382 - the per-block trade detail would not open at all). One empty cell must not
 * make the screen disappear, and filling it with 0 would be a lie meaning "the P&L is zero".
 */
function money(v: number | undefined, currency: Currency): string {
  return typeof v === "number" && Number.isFinite(v) ? formatMoney(v, currency) : "—";
}

/** A non-currency number, such as a quantity. `—` when absent. */
function num(v: number | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toLocaleString() : "—";
}

function formatMoney(v: number, currency: Currency): string {
  if (currency === "USD") {
    return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${Math.round(v).toLocaleString()}원`;
}

/** The simple moving average (SMA) - null before `window` trading days (the line has not started). */
function sma(closes: number[], window: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < window - 1) return null;
    let sum = 0;
    for (let k = i - window + 1; k <= i; k++) sum += closes[k];
    return sum / window;
  });
}

type ChartInstance = { dispatchAction: (payload: { type: string; name?: string }) => void };

export default function PortfolioDetailClient({
  env,
  currency,
  center,
  trades,
  pricesByTicker,
  names,
  history,
  blocks = [],
  portfolioId = null,
}: Props) {
  const isMobile = useMobile();
  const label = (tk: string) => names[tk] ?? tk;
  const tickers = Object.keys(pricesByTicker);

  // Only the symbols traded on the center date are shown by default (legend on); the rest are off.
  const centerTickers = useMemo(
    () => new Set(center ? trades.filter((t) => t.date === center).map((t) => t.ticker) : []),
    [center, trades],
  );
  const isOn = (tk: string) => centerTickers.size === 0 || centerTickers.has(tk);
  const tickerLabelSet = useMemo(() => new Set(tickers.map((tk) => label(tk))), [pricesByTicker, names]); // eslint-disable-line react-hooks/exhaustive-deps

  const option = useMemo<EChartsOption>(() => {
    // The union of every symbol's dates - aligning all the closes and moving averages to one x axis.
    // The union of every symbol's dates - aligning all the closes and moving averages to one x axis.
    // **Nothing is trimmed** (#133) - only the initially visible window is set by the dataZoom below.
    const allDates = Array.from(
      new Set(Object.values(pricesByTicker).flatMap((rows) => rows.map((r) => r.date))),
    ).sort();

    const legendNames: string[] = [];
    const selected: Record<string, boolean> = {};
    const series: NonNullable<EChartsOption["series"]> = [];

    tickers.forEach((tk, idx) => {
      const color = PALETTE[idx % PALETTE.length];
      const rows = pricesByTicker[tk];
      const priceMap = new Map(rows.map((r) => [r.date, r.close]));
      const closeSeq = rows.map((r) => r.close);
      const ma20Seq = sma(closeSeq, 20);
      const ma60Seq = sma(closeSeq, 60);
      const ma20Map = new Map(rows.map((r, i) => [r.date, ma20Seq[i]]));
      const ma60Map = new Map(rows.map((r, i) => [r.date, ma60Seq[i]]));

      const closeData = allDates.map((d) => priceMap.get(d) ?? null);
      const ma20Data = allDates.map((d) => ma20Map.get(d) ?? null);
      const ma60Data = allDates.map((d) => ma60Map.get(d) ?? null);

      const nameClose = label(tk);
      const name20 = `${label(tk)}·20`;
      const name60 = `${label(tk)}·60`;
      // Only symbol names appear in the legend - the 20- and 60-day lines toggle with the close in legendselectchanged (the onEvents below).
      legendNames.push(nameClose);
      selected[nameClose] = isOn(tk);

      // Trade markers are attached as the close series' markPoint, so they turn on and off with the close's legend toggle.
      // A fill with no price has no y coordinate to mark - including it puts undefined into coord (#382).
      const tks = trades.filter(
        (t): t is typeof t & { price: number } =>
          t.ticker === tk && typeof t.price === "number" && Number.isFinite(t.price),
      );
      const markData = [
        ...tks.filter((t) => t.action === "buy").map((t) => ({
          name: "매수", coord: [t.date, t.price], symbol: "triangle", symbolSize: 12, itemStyle: { color: "#dc2626" },
        })),
        ...tks.filter((t) => t.action === "sell").map((t) => ({
          name: "매도", coord: [t.date, t.price], symbol: "triangle", symbolRotate: 180, symbolSize: 12, itemStyle: { color: "#2563eb" },
        })),
      ];

      series.push(
        {
          name: nameClose,
          type: "line",
          showSymbol: false,
          connectNulls: true,
          data: closeData,
          itemStyle: { color },
          lineStyle: { width: 2 },
          markPoint: markData.length ? { data: markData, label: { show: false } } : undefined,
        },
        {
          name: name20,
          type: "line",
          showSymbol: false,
          connectNulls: true,
          data: ma20Data,
          itemStyle: { color },
          lineStyle: { width: 1, type: "dashed", opacity: 0.7 },
        },
        {
          name: name60,
          type: "line",
          showSymbol: false,
          connectNulls: true,
          data: ma60Data,
          itemStyle: { color },
          lineStyle: { width: 1, type: "dotted", opacity: 0.7 },
        },
      );
    });

    return {
      tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
      legend: { type: "scroll", data: legendNames, selected, bottom: 0 },
      grid: { left: 16, right: 16, top: 24, bottom: 48, containLabel: true },
      xAxis: { type: "category", data: allDates },
      yAxis: { type: "value", scale: true, axisLabel: { show: false } },
      // The bottom slider (the brush) is hidden and only wheel/drag zoom (inside) is used - with center, the recent range is zoomed.
      dataZoom: [
        // The window length is always the same (30 days on mobile, 90 on desktop). With a center it only
        // shifts position to contain that date (#135).
        //
        // It used to be `start: 60, end: 100` (the last 40% of everything) whenever there was a center, and since arriving
        // through a marker **always** attaches one, that exception always won and the 30-day window never applied.
        {
          type: "inside",
          ...((center && windowAround(allDates, center, isMobile)) ?? {
            startValue: windowStartDate(allDates, isMobile),
          }),
        },
      ],
      series,
    };
  }, [pricesByTicker, trades, names, center, isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  // The legend holds symbol names only, so turning a symbol's close on or off toggles its 20- and 60-day lines too.
  const handleLegendToggle = (
    params: { name?: string; selected?: Record<string, boolean> },
    chart: ChartInstance,
  ) => {
    const name = params.name;
    if (!name || !tickerLabelSet.has(name)) return; // only symbol-name entries are handled (preventing recursion)
    const on = params.selected?.[name] ?? false;
    const type = on ? "legendSelect" : "legendUnSelect";
    chart.dispatchAction({ type, name: `${name}·20` });
    chart.dispatchAction({ type, name: `${name}·60` });
  };

  // Initially: hide the 20- and 60-day lines of symbols off by default (not the center ones) - they are not in the legend, so selected cannot catch them.
  const handleChartReady = (chart: ChartInstance) => {
    tickers.forEach((tk) => {
      if (isOn(tk)) return;
      chart.dispatchAction({ type: "legendUnSelect", name: `${label(tk)}·20` });
      chart.dispatchAction({ type: "legendUnSelect", name: `${label(tk)}·60` });
    });
  };

  const marketLabel = `${envLabel(env)} · ${currency === "KRW" ? "국장" : "미장"}`;
  const tradesDesc = [...trades].reverse(); // the newest trades on top
  const historyDesc = [...history].reverse();

  // This screen is reached by clicking a chart marker, arriving as `?center=<date>`. Blindly showing page 1 when
  // paging was added would mean **the clicked marker's trade is not visible** - an existing feature lost.
  // It opens on the page containing that date (the first page when absent).
  const [tradesPage, setTradesPage] = useState(() =>
    pageOfIndex(center ? tradesDesc.findIndex((t) => t.date === center) : -1, PAGE_SIZE),
  );
  const [historyPage, setHistoryPage] = useState(0);

  return (
    <main className="mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">매매 상세 — {marketLabel}</h1>
        <Link href="/admin/portfolio" className="text-sm text-blue-600 hover:underline">
          ← 매매 차트로
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        {center ? `${center} 매매 종목` : "매매 종목"}을 기본 표시. 범례에서 종목을 켜고 끄면 종가·20일선·60일선이 함께 토글됩니다. 종가 실선, 20일선 파선, 60일선 점선. 매수(▲)/매도(▼) 마커.
      </p>

      {/* 전략(포트폴리오) 탭 — 블록이 둘 이상일 때만. 하나면 「전체」와 같아 군더더기다. */}
      {blocks.length > 1 && (
        <div className="flex flex-nowrap gap-2 border-b mb-4 overflow-x-auto overflow-y-hidden">
          {[{ portfolioId: "", strategy: "" }, ...blocks].map((b) => {
            const active = (b.portfolioId || null) === portfolioId;
            const q = new URLSearchParams({ env, currency });
            if (center) q.set("center", center);
            if (b.portfolioId) q.set("portfolioId", b.portfolioId);
            return (
              <Link
                key={b.portfolioId || "all"}
                href={`/admin/portfolio/detail?${q.toString()}`}
                className={
                  "px-3 py-2 text-sm border-b-2 -mb-px transition whitespace-nowrap shrink-0 " +
                  (active
                    ? "border-blue-600 text-blue-600 font-medium"
                    : "border-transparent text-gray-500 hover:text-gray-700")
                }
              >
                {b.portfolioId ? strategyLabel(b.strategy) : "전체"}
              </Link>
            );
          })}
        </div>
      )}

      {tickers.length > 0 ? (
        <div className="w-full aspect-[4/3] sm:aspect-auto sm:h-[420px]">
          <ReactECharts
            option={option}
            onChartReady={handleChartReady}
            onEvents={{ legendselectchanged: handleLegendToggle }}
            style={{ width: "100%", height: "100%" }}
            notMerge
            lazyUpdate
          />
        </div>
      ) : (
        <p className="text-gray-400 py-12 text-center">이 조합에 매매 종목 주가 데이터가 없습니다.</p>
      )}

      {/* 매매 기록 표 */}
      <h2 className="text-lg font-semibold mt-8 mb-3">매매 기록</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-gray-500 text-left">
              <th className="py-2 pr-3">날짜</th>
              <th className="py-2 pr-3">종목</th>
              <th className="py-2 pr-3">전략</th>
              <th className="py-2 pr-3">구분</th>
              <th className="py-2 pr-3 text-right">수량</th>
              <th className="py-2 pr-3 text-right">가격</th>
              <th className="py-2 pr-3 text-right">금액</th>
              <th className="py-2 pr-3 text-right">체결후 보유</th>
            </tr>
          </thead>
          <tbody>
            {pageSlice(tradesDesc, tradesPage, PAGE_SIZE).map((t, i) => (
              <tr
                key={`${t.date}-${t.ticker}-${i}`}
                className={`border-b border-gray-100 dark:border-gray-800${
                  center && t.date === center ? " bg-yellow-50 dark:bg-yellow-900/20" : ""
                }`}
              >
                <td className="py-1.5 pr-3 whitespace-nowrap">{t.date}</td>
                <td className="py-1.5 pr-3">
                  {label(t.ticker)} <span className="text-xs text-gray-400 font-mono">{t.ticker}</span>
                </td>
                <td className="py-1.5 pr-3 text-xs text-gray-500 whitespace-nowrap">
                  {strategyLabel(t.strategy)}
                </td>
                <td className={`py-1.5 pr-3 font-medium ${t.action === "buy" ? "text-red-600" : "text-blue-600"}`}>
                  {t.action === "buy" ? "▲ 매수" : "▼ 매도"}
                </td>
                <td className="py-1.5 pr-3 text-right">{num(t.qty)}</td>
                <td className="py-1.5 pr-3 text-right">{money(t.price, currency)}</td>
                <td className="py-1.5 pr-3 text-right">{money(t.amount, currency)}</td>
                <td className="py-1.5 pr-3 text-right">{num(t.cumulativeQty)}</td>
              </tr>
            ))}
            {tradesDesc.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-gray-400">매매 기록이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={tradesPage} total={tradesDesc.length} size={PAGE_SIZE} onPage={setTradesPage} />

      {/* 날짜별 포트폴리오 표 */}
      <h2 className="text-lg font-semibold mt-8 mb-3">날짜별 포트폴리오</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-gray-500 text-left">
              <th className="py-2 pr-3">날짜</th>
              <th className="py-2 pr-3 text-right">추정 총재산</th>
              <th className="py-2 pr-3 text-right">현금</th>
              <th className="py-2 pr-3 text-right">보유 평가액</th>
              <th className="py-2 pr-3 text-right">누적 손익</th>
            </tr>
          </thead>
          <tbody>
            {pageSlice(historyDesc, historyPage, PAGE_SIZE).map((h) => (
              <tr key={h.dateStr} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  {h.dateStr}
                  {h.backfilled && (
                    <span className="ml-1 text-[10px] text-gray-400" title="매매기록·일봉으로 되살린 값">되살림</span>
                  )}
                </td>
                {/* 되살린 행은 보유 평가액만 안다 — 나머지는 모르는 값이라 숫자로 내보이지 않는다. */}
                <td className="py-1.5 pr-3 text-right font-medium">
                  {h.backfilled ? "—" : money(h.totalValue, currency)}
                </td>
                <td className="py-1.5 pr-3 text-right">
                  {h.backfilled ? "—" : money(h.cash, currency)}
                </td>
                <td className="py-1.5 pr-3 text-right">{money(h.holdingsValue, currency)}</td>
                <td className={`py-1.5 pr-3 text-right ${(h.cumulativePnl ?? 0) >= 0 ? "text-red-600" : "text-blue-600"}`}>
                  {h.backfilled ? "—" : money(h.cumulativePnl, currency)}
                </td>
              </tr>
            ))}
            {historyDesc.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-gray-400">포트폴리오 기록이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={historyPage} total={historyDesc.length} size={PAGE_SIZE} onPage={setHistoryPage} />
    </main>
  );
}
