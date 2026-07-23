"use client";

import { useState } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

// 크로스섹셔널 팩터 백테스트 패널(백테스트 탭 안에서 렌더). 서버 라우트가 유니버스를 로드·연산.
// focus 지정(개별 팩터 탭): 해당 팩터 + 벤치마크만. focus 없음(비교 탭): 전 전략 + 체크박스 선택.
// 팩터는 월 리밸런스 포트폴리오라 개별 매매시점 마커는 의미가 약해 자산곡선(수익률)으로 비교한다.

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

export type FactorKind = "low_vol" | "momentum" | "reversal";

const COLORS: Record<string, string> = {
  momentum: "#2563eb",
  reversal: "#db2777",
  low_vol: "#16a34a",
  equal_weight: "#6b7280",
  market: "#f59e0b",
};

export default function FactorPanel({ focus, defaultFrom, defaultTo }: { focus?: FactorKind; defaultFrom?: string; defaultTo?: string }) {
  const [market, setMarket] = useState("us");
  const [from, setFrom] = useState(defaultFrom || "2015-01-01");
  const [to, setTo] = useState(defaultTo || "2024-12-31");
  const [quantile, setQuantile] = useState(0.2);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set()); // 비교 모드: 숨긴 시리즈

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

  const all = data ? data.strategies : [];
  // 개별(focus): 해당 팩터 + 벤치마크. 비교: 전 전략 중 체크된 것.
  const shown = focus
    ? all.filter((s) => s.key === focus || s.key === "equal_weight" || s.key === "market")
    : all.filter((s) => !hidden.has(s.key));

  const chart: EChartsOption | null = shown.length
    ? {
        tooltip: { trigger: "axis" },
        legend: { data: shown.map((s) => s.name), textStyle: { color: "#888" } },
        grid: { left: 55, right: 20, top: 34, bottom: 40 },
        xAxis: { type: "category", data: shown[0].equityCurve.map((p) => p.date), axisLabel: { color: "#888" } },
        yAxis: { type: "value", name: "성장(1=시작)", scale: true, axisLabel: { color: "#888" } },
        series: shown.map((s) => ({
          name: s.name,
          type: "line",
          showSymbol: false,
          sampling: "lttb",
          lineStyle: { width: focus && s.key === focus ? 2.5 : 1.4, color: COLORS[s.key] },
          itemStyle: { color: COLORS[s.key] },
          data: s.equityCurve.map((p) => Number(p.equity.toFixed(4))),
        })),
      }
    : null;

  const toggle = (k: string) =>
    setHidden((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div>
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
        <button onClick={run} disabled={loading} className="py-2 px-4 rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? "실행 중…" : "백테스트 실행"}
        </button>
      </div>

      {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
      {loading && <p className="text-gray-500 text-sm">유니버스 로드·연산 중 (수십 초 걸릴 수 있음)…</p>}

      {data && (
        <>
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            {data.universe} · 로드종목 {data.universeSize} · 분위 {Math.round(data.quantile * 100)}% · {data.from}~{data.to}
          </div>

          {!focus && (
            // 비교 모드: 표시할 전략 선택 체크박스
            <div className="flex flex-wrap gap-3 mb-3 text-sm">
              {all.map((s) => (
                <label key={s.key} className="flex items-center gap-1 cursor-pointer" style={{ color: COLORS[s.key] }}>
                  <input type="checkbox" checked={!hidden.has(s.key)} onChange={() => toggle(s.key)} />
                  {s.name}
                </label>
              ))}
            </div>
          )}

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
                {shown.map((s) => (
                  <tr key={s.key} className={"border-b border-gray-100 dark:border-gray-800 " + (focus && s.key === focus ? "font-semibold" : "")}>
                    <td className="py-2 pr-4" style={{ color: COLORS[s.key] }}>
                      {s.name}
                      {focus && s.key === focus ? " ★" : ""}
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
            <div style={{ height: 380 }}>
              <ReactECharts option={chart} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
            </div>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">⚠ {data.note}</p>
        </>
      )}
    </div>
  );
}
