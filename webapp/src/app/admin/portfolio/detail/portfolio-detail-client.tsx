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

function formatMoney(v: number, currency: Currency): string {
  if (currency === "USD") {
    return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${Math.round(v).toLocaleString()}원`;
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

  const option = useMemo<EChartsOption>(() => {
    const tickers = Object.keys(pricesByTicker);
    const allDates = Array.from(
      new Set(Object.values(pricesByTicker).flatMap((rows) => rows.map((r) => r.date))),
    ).sort();

    // 종목별 종가 라인 (날짜 union 기준, 결측은 null 로 이어붙임).
    const lineSeries = tickers.map((tk) => {
      const priceMap = new Map(pricesByTicker[tk].map((r) => [r.date, r.close]));
      return {
        name: label(tk),
        type: "line" as const,
        showSymbol: false,
        connectNulls: true,
        data: allDates.map((d) => priceMap.get(d) ?? null),
      };
    });

    // 매수(▲빨강)/매도(▼파랑) 마커 — 매매 가격 위치에 scatter.
    const buyData = trades.filter((t) => t.action === "buy").map((t) => [t.date, t.price]);
    const sellData = trades.filter((t) => t.action === "sell").map((t) => [t.date, t.price]);
    const markerSeries = [
      {
        name: "매수",
        type: "scatter" as const,
        data: buyData,
        symbol: "triangle",
        symbolSize: 11,
        itemStyle: { color: "#dc2626" },
        z: 5,
      },
      {
        name: "매도",
        type: "scatter" as const,
        data: sellData,
        symbol: "triangle",
        symbolRotate: 180,
        symbolSize: 11,
        itemStyle: { color: "#2563eb" },
        z: 5,
      },
    ];

    return {
      tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
      legend: { type: "scroll", data: [...tickers.map(label), "매수", "매도"], bottom: 0 },
      grid: { left: 16, right: 16, top: 24, bottom: 32, containLabel: true },
      xAxis: { type: "category", data: allDates },
      yAxis: { type: "value", scale: true, axisLabel: { show: false } },
      // 하단 슬라이더(브러시)는 감추고 휠/드래그 줌(inside)만 — center 면 최근 구간을 확대.
      dataZoom: [{ type: "inside", start: center ? 60 : 0, end: 100 }],
      series: [...lineSeries, ...markerSeries],
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
      <p className="text-sm text-gray-500 mb-6">
        매매 종목 주가 + 매수(▲)/매도(▼) 마커, 매매 기록과 날짜별 포트폴리오.
      </p>

      {Object.keys(pricesByTicker).length > 0 ? (
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
