"use client";

import { useMemo, useState } from "react";
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
  const [selectedTicker, setSelectedTicker] = useState<string>(tickers[0] ?? "");

  const option = useMemo<EChartsOption>(() => {
    const rows = pricesByTicker[selectedTicker] ?? [];
    const dates = rows.map((r) => r.date);
    const closes = rows.map((r) => r.close);
    const ma20 = sma(closes, 20);
    const ma60 = sma(closes, 60);

    // 선택 종목의 매매만 마커로.
    const tks = trades.filter((t) => t.ticker === selectedTicker);
    const buyData = tks.filter((t) => t.action === "buy").map((t) => [t.date, t.price]);
    const sellData = tks.filter((t) => t.action === "sell").map((t) => [t.date, t.price]);

    return {
      tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
      legend: { type: "scroll", data: [label(selectedTicker), "20일선", "60일선", "매수", "매도"], bottom: 0 },
      grid: { left: 16, right: 16, top: 24, bottom: 32, containLabel: true },
      xAxis: { type: "category", data: dates },
      yAxis: { type: "value", scale: true, axisLabel: { show: false } },
      // 하단 슬라이더(브러시)는 감추고 휠/드래그 줌(inside)만 — center 면 최근 구간을 확대.
      dataZoom: [{ type: "inside", start: center ? 60 : 0, end: 100 }],
      series: [
        {
          name: label(selectedTicker),
          type: "line",
          showSymbol: false,
          connectNulls: true,
          data: closes,
          lineStyle: { width: 2 },
        },
        {
          name: "20일선",
          type: "line",
          showSymbol: false,
          connectNulls: true,
          data: ma20,
          lineStyle: { width: 1, opacity: 0.9 },
          itemStyle: { color: "#f59e0b" },
        },
        {
          name: "60일선",
          type: "line",
          showSymbol: false,
          connectNulls: true,
          data: ma60,
          lineStyle: { width: 1, opacity: 0.9 },
          itemStyle: { color: "#8b5cf6" },
        },
        {
          name: "매수",
          type: "scatter",
          data: buyData,
          symbol: "triangle",
          symbolSize: 11,
          itemStyle: { color: "#dc2626" },
          z: 5,
        },
        {
          name: "매도",
          type: "scatter",
          data: sellData,
          symbol: "triangle",
          symbolRotate: 180,
          symbolSize: 11,
          itemStyle: { color: "#2563eb" },
          z: 5,
        },
      ],
    };
  }, [pricesByTicker, trades, names, selectedTicker, center]); // eslint-disable-line react-hooks/exhaustive-deps

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
        종목별 종가 + 20/60일선 + 매수(▲)/매도(▼) 마커, 매매 기록과 날짜별 포트폴리오.
      </p>

      {tickers.length > 0 ? (
        <>
          {/* 종목 선택 — 고른 한 종목의 종가·이동평균·매매를 차트로. 종목 1개면 생략. */}
          {tickers.length > 1 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {tickers.map((tk) => (
                <button
                  key={tk}
                  type="button"
                  onClick={() => setSelectedTicker(tk)}
                  className={
                    "px-2.5 py-1 text-xs rounded border transition " +
                    (tk === selectedTicker
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800")
                  }
                >
                  {label(tk)}
                </button>
              ))}
            </div>
          )}
          <div className="w-full aspect-[4/3] sm:aspect-auto sm:h-[420px]">
            <ReactECharts option={option} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
          </div>
        </>
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
