"use client";

import { envLabel } from "@/lib/env-label";

import { useMemo, useState } from "react";
import { useMobile } from "@/hooks/use-mobile";
import { windowAround, windowStartDate } from "../recent-points";
import Link from "next/link";
import ReactECharts from "echarts-for-react";
import Pager, { pageOfIndex, pageSlice } from "@/components/pager";
import type { EChartsOption } from "echarts";

/** 한 페이지에 보여줄 행 수. monitor 화면의 주문 로그와 같은 값으로 맞춘다 (#184). */
const PAGE_SIZE = 25;

type Env = string;
type Currency = "KRW" | "USD";

type Trade = {
  ticker: string;
  action: "buy" | "sell";
  qty: number;
  cumulativeQty: number;
  price: number;
  amount: number;
  date: string;
  strategy: string;
};
type HistoryPoint = {
  dateStr: string;
  totalValue: number;
  cash: number;
  holdingsValue: number;
  cumulativePnl: number;
};

type Props = {
  env: Env;
  currency: Currency;
  center: string | null;
  trades: Trade[];
  pricesByTicker: Record<string, { date: string; close: number }[]>;
  names: Record<string, string>;
  history: HistoryPoint[];
};

// 종목별 색 팔레트 — 종가/20일선/60일선을 같은 색으로, 선 스타일로 구분.
const PALETTE = [
  "#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de",
  "#3ba272", "#fc8452", "#9a60b4", "#ea7ccc", "#c14953",
  "#2f4b7c", "#665191", "#a05195", "#d45087", "#f95d6a",
  "#ff7c43", "#ffa600", "#488f31", "#de425b", "#69b3a2",
];

function formatMoney(v: number, currency: Currency): string {
  if (currency === "USD") {
    return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${Math.round(v).toLocaleString()}원`;
}

/** 단순이동평균(SMA) — window 거래일 미만 구간은 null(라인 시작 전). */
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
}: Props) {
  const isMobile = useMobile();
  const label = (tk: string) => names[tk] ?? tk;
  const tickers = Object.keys(pricesByTicker);

  // center 날짜에 매매된 종목만 기본 표시(legend on), 나머지는 꺼둠.
  const centerTickers = useMemo(
    () => new Set(center ? trades.filter((t) => t.date === center).map((t) => t.ticker) : []),
    [center, trades],
  );
  const isOn = (tk: string) => centerTickers.size === 0 || centerTickers.has(tk);
  const tickerLabelSet = useMemo(() => new Set(tickers.map((tk) => label(tk))), [pricesByTicker, names]); // eslint-disable-line react-hooks/exhaustive-deps

  const option = useMemo<EChartsOption>(() => {
    // 전체 종목의 날짜 union — 모든 종가/이동평균을 같은 x축에 정렬.
    // 전체 종목의 날짜 union — 모든 종가/이동평균을 같은 x축에 정렬.
    // **자르지 않는다** (#133) — 처음 보이는 창만 아래 dataZoom 에서 잡는다.
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
      // 범례엔 종목명만 노출 — 20/60일선은 legendselectchanged 에서 종가와 함께 토글(아래 onEvents).
      legendNames.push(nameClose);
      selected[nameClose] = isOn(tk);

      // 매매 마커 — 종가 series 의 markPoint 로 붙여, 종가 legend 토글 시 함께 켜지고 꺼짐.
      const tks = trades.filter((t) => t.ticker === tk);
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
      // 하단 슬라이더(브러시)는 감추고 휠/드래그 줌(inside)만 — center 면 최근 구간을 확대.
      dataZoom: [
        // 창 길이는 늘 같다(모바일 30 일·데스크톱 90 일). center 가 있으면 그 날짜를 품도록
        // 자리만 옮긴다 (#135).
        //
        // 예전엔 center 일 때 `start: 60, end: 100`(전체의 뒤 40%)이었는데, 마커로 들어오면
        // center 가 **항상** 붙으므로 그 예외가 늘 이겨 30 일 창이 한 번도 적용되지 않았다.
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

  // 범례엔 종목명만 있으므로, 종목 종가를 켜고/끌 때 그 종목의 20/60일선도 같이 토글.
  const handleLegendToggle = (
    params: { name?: string; selected?: Record<string, boolean> },
    chart: ChartInstance,
  ) => {
    const name = params.name;
    if (!name || !tickerLabelSet.has(name)) return; // 종목명 항목만 처리(재귀 방지)
    const on = params.selected?.[name] ?? false;
    const type = on ? "legendSelect" : "legendUnSelect";
    chart.dispatchAction({ type, name: `${name}·20` });
    chart.dispatchAction({ type, name: `${name}·60` });
  };

  // 초기: 기본 꺼진(center 아닌) 종목의 20/60일선을 숨긴다(범례엔 없어 selected 로 못 잡음).
  const handleChartReady = (chart: ChartInstance) => {
    tickers.forEach((tk) => {
      if (isOn(tk)) return;
      chart.dispatchAction({ type: "legendUnSelect", name: `${label(tk)}·20` });
      chart.dispatchAction({ type: "legendUnSelect", name: `${label(tk)}·60` });
    });
  };

  const marketLabel = `${envLabel(env)} · ${currency === "KRW" ? "국장" : "미장"}`;
  const tradesDesc = [...trades].reverse(); // 최신 매매가 위로
  const historyDesc = [...history].reverse();

  // 이 화면은 차트 마커를 눌러 `?center=<날짜>` 로 들어온다. 페이징을 넣으면서 무턱대고
  // 1페이지를 보여 주면 **누른 마커의 매매가 안 보인다** — 있던 기능이 사라지는 셈이다.
  // 그 날짜가 든 페이지로 연다(없으면 첫 페이지).
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
                <td className={`py-1.5 pr-3 font-medium ${t.action === "buy" ? "text-red-600" : "text-blue-600"}`}>
                  {t.action === "buy" ? "▲ 매수" : "▼ 매도"}
                </td>
                <td className="py-1.5 pr-3 text-right">{t.qty.toLocaleString()}</td>
                <td className="py-1.5 pr-3 text-right">{formatMoney(t.price, currency)}</td>
                <td className="py-1.5 pr-3 text-right">{formatMoney(t.amount, currency)}</td>
                <td className="py-1.5 pr-3 text-right">{t.cumulativeQty.toLocaleString()}</td>
              </tr>
            ))}
            {tradesDesc.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-gray-400">매매 기록이 없습니다.</td></tr>
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
                <td className="py-1.5 pr-3 whitespace-nowrap">{h.dateStr}</td>
                <td className="py-1.5 pr-3 text-right font-medium">{formatMoney(h.totalValue, currency)}</td>
                <td className="py-1.5 pr-3 text-right">{formatMoney(h.cash, currency)}</td>
                <td className="py-1.5 pr-3 text-right">{formatMoney(h.holdingsValue, currency)}</td>
                <td className={`py-1.5 pr-3 text-right ${h.cumulativePnl >= 0 ? "text-red-600" : "text-blue-600"}`}>
                  {formatMoney(h.cumulativePnl, currency)}
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
