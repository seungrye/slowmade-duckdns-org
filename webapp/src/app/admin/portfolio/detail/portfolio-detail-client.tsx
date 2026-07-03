"use client";

import { useMemo } from "react";
import Link from "next/link";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

type Env = "paper" | "real";
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

export default function PortfolioDetailClient({
  env,
  currency,
  center,
  trades,
  pricesByTicker,
  names,
  history,
}: Props) {
  const label = (tk: string) => names[tk] ?? tk;
  const tickers = Object.keys(pricesByTicker);

  const option = useMemo<EChartsOption>(() => {
    // 전체 종목의 날짜 union — 모든 종가/이동평균을 같은 x축에 정렬.
    const allDates = Array.from(
      new Set(Object.values(pricesByTicker).flatMap((rows) => rows.map((r) => r.date))),
    ).sort();

    // center 날짜에 매매된 종목만 기본 표시(legend on), 나머지는 꺼둠.
    const centerTickers = new Set(
      center ? trades.filter((t) => t.date === center).map((t) => t.ticker) : [],
    );
    const isOn = (tk: string) => centerTickers.size === 0 || centerTickers.has(tk);

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
      legendNames.push(nameClose, name20, name60);
      const on = isOn(tk);
      selected[nameClose] = on;
      selected[name20] = on;
      selected[name60] = on;

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
      dataZoom: [{ type: "inside", start: center ? 60 : 0, end: 100 }],
      series,
    };
  }, [pricesByTicker, trades, names, center]); // eslint-disable-line react-hooks/exhaustive-deps

  const marketLabel = `${env === "paper" ? "모의" : "실전"} · ${currency === "KRW" ? "국장" : "미장"}`;
  const tradesDesc = [...trades].reverse(); // 최신 매매가 위로
  const historyDesc = [...history].reverse();

  return (
    <main className="mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">매매 상세 — {marketLabel}</h1>
        <Link href="/admin/portfolio" className="text-sm text-blue-600 hover:underline">
          ← 매매 차트로
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        {center ? `${center} 매매 종목` : "매매 종목"}을 기본 표시(종가·20일선·60일선). 범례를 눌러 다른 종목/이동평균선을 켜고 끌 수 있습니다. 종가 실선, 20일선 파선, 60일선 점선. 매수(▲)/매도(▼) 마커.
      </p>

      {tickers.length > 0 ? (
        <div className="w-full aspect-[4/3] sm:aspect-auto sm:h-[420px]">
          <ReactECharts option={option} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
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
            {tradesDesc.map((t, i) => (
              <tr key={`${t.date}-${t.ticker}-${i}`} className="border-b border-gray-100 dark:border-gray-800">
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
            {historyDesc.map((h) => (
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
    </main>
  );
}
