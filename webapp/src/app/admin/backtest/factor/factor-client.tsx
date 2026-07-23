"use client";

import { useState } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

interface Metrics {
  final: number;
  totalReturnPct: number;
  cagr: number;
  mdd: number;
  calmar: number;
  sharpe: number;
}
interface Strat {
  key: string;
  name: string;
  metrics: Metrics;
  equityCurve: { date: string; equity: number }[];
}
interface Resp {
  market: string;
  universe: string;
  universeSize: number;
  from: string;
  to: string;
  quantile: number;
  note: string;
  strategies: Strat[];
}

const COLORS: Record<string, string> = {
  momentum: "#2563eb",
  reversal: "#db2777",
  low_vol: "#16a34a",
  equal_weight: "#6b7280",
  market: "#f59e0b",
};

export default function FactorClient() {
  const [market, setMarket] = useState("us");
  const [from, setFrom] = useState("2015-01-01");
  const [to, setTo] = useState("2024-12-31");
  const [quantile, setQuantile] = useState(0.2);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState("");

  const run = async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/admin/backtest/factor?market=${market}&from=${from}&to=${to}&quantile=${quantile}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "요청 실패");
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const chart: EChartsOption | null =
    data && data.strategies.length
      ? {
          tooltip: { trigger: "axis" },
          legend: { data: data.strategies.map((s) => s.name), textStyle: { color: "#888" } },
          grid: { left: 55, right: 20, top: 34, bottom: 40 },
          xAxis: { type: "category", data: data.strategies[0].equityCurve.map((p) => p.date), axisLabel: { color: "#888" } },
          yAxis: { type: "value", name: "성장(1=시작)", scale: true, axisLabel: { color: "#888" } },
          series: data.strategies.map((s) => ({
            name: s.name,
            type: "line",
            showSymbol: false,
            sampling: "lttb",
            lineStyle: { width: 1.5, color: COLORS[s.key] },
            itemStyle: { color: COLORS[s.key] },
            data: s.equityCurve.map((p) => Number(p.equity.toFixed(4))),
          })),
        }
      : null;

  return (
    <div className="p-4 max-w-5xl mx-auto text-gray-800 dark:text-gray-200">
      <h1 className="text-xl font-bold mb-1">크로스섹셔널 팩터 백테스트 비교</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        저변동성 · 모멘텀(12-1) · 단기 평균회귀 — 유니버스를 팩터로 랭킹해 상위 분위 동일가중, 월 리밸런스.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-sm">
          시장
          <select value={market} onChange={(e) => setMarket(e.target.value)} className="block border border-gray-300 dark:border-gray-600 rounded px-2 py-1 dark:bg-gray-800">
            <option value="us">{"미국 S&P500"}</option>
            <option value="kr">국내 KOSPI200</option>
          </select>
        </label>
        <label className="text-sm">
          시작
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block border border-gray-300 dark:border-gray-600 rounded px-2 py-1 dark:bg-gray-800" />
        </label>
        <label className="text-sm">
          종료
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block border border-gray-300 dark:border-gray-600 rounded px-2 py-1 dark:bg-gray-800" />
        </label>
        <label className="text-sm">
          분위
          <input type="number" min={0.05} max={0.5} step={0.05} value={quantile} onChange={(e) => setQuantile(Number(e.target.value))} className="block border border-gray-300 dark:border-gray-600 rounded px-2 py-1 w-20 dark:bg-gray-800" />
        </label>
        <button onClick={run} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50">
          {loading ? "실행 중…" : "실행"}
        </button>
      </div>

      {err && <p className="text-red-500 text-sm mb-3">{err}</p>}
      {loading && <p className="text-gray-500 text-sm">유니버스 로드·연산 중 (수십 초 걸릴 수 있음)…</p>}

      {data && (
        <>
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            {data.universe} · 로드종목 {data.universeSize} · 분위 {Math.round(data.quantile * 100)}% · {data.from}~{data.to}
          </div>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                  <th className="py-2 pr-4">전략</th>
                  <th className="py-2 pr-4 text-right">총수익%</th>
                  <th className="py-2 pr-4 text-right">CAGR%</th>
                  <th className="py-2 pr-4 text-right">MDD%</th>
                  <th className="py-2 pr-4 text-right">Sharpe</th>
                  <th className="py-2 pr-4 text-right">Calmar</th>
                </tr>
              </thead>
              <tbody>
                {data.strategies.map((s) => (
                  <tr key={s.key} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2 pr-4 font-medium" style={{ color: COLORS[s.key] }}>
                      {s.name}
                    </td>
                    <td className="py-2 pr-4 text-right">{s.metrics.totalReturnPct.toFixed(1)}</td>
                    <td className="py-2 pr-4 text-right">{s.metrics.cagr.toFixed(1)}</td>
                    <td className="py-2 pr-4 text-right">{s.metrics.mdd.toFixed(1)}</td>
                    <td className="py-2 pr-4 text-right">{s.metrics.sharpe.toFixed(2)}</td>
                    <td className="py-2 pr-4 text-right">{s.metrics.calmar.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {chart && (
            <div style={{ height: 360 }}>
              <ReactECharts option={chart} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
            </div>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">⚠ {data.note}</p>
        </>
      )}
    </div>
  );
}
