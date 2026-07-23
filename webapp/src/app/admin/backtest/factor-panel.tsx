"use client";

import { useEffect, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type { BacktestMetrics } from "@/lib/backtest/metrics";

// 크로스섹셔널 팩터 백테스트 개별 탭 패널. 서버 라우트가 유니버스를 로드·연산.
// 선택 팩터(focus) + 벤치마크(동일가중·시장ETF)를 표·차트로. "비교에 추가" 체크 시 focus 팩터를
// 상위(backtest-client)의 범용 비교 맵에 담는다. 원금/월적립금은 다른 탭과 공유(부모 state).

interface Metrics {
  final: number;
  totalReturnPct: number;
  cagr: number;
  mdd: number;
  calmar: number;
  sharpe: number;
  totalContributed?: number; // 적립식일 때 원금 + Σ적립
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
  principal: number;
  contribution: number;
  note: string;
  strategies: Strat[];
}

export type FactorKind = "low_vol" | "momentum" | "reversal";

// 범용 비교 항목(브라우저/팩터 공통). curve.v 는 시작=1 재기준값.
export interface CompareEntry {
  label: string;
  sub: string;
  curve: { date: string; v: number }[];
  metrics: BacktestMetrics;
}

const COLORS: Record<string, string> = {
  momentum: "#2563eb",
  reversal: "#db2777",
  low_vol: "#16a34a",
  equal_weight: "#6b7280",
  market: "#f59e0b",
};

export default function FactorPanel({
  focus,
  defaultFrom,
  defaultTo,
  inCompare,
  onSetCompare,
  principal,
  monthlyContribution,
  onPrincipal,
  onMonthly,
}: {
  focus: FactorKind;
  defaultFrom?: string;
  defaultTo?: string;
  inCompare: boolean;
  onSetCompare: (e: CompareEntry | null) => void;
  principal: number;
  monthlyContribution: number;
  onPrincipal: (n: number) => void;
  onMonthly: (n: number) => void;
}) {
  const [market, setMarket] = useState("us");
  const [from, setFrom] = useState(defaultFrom || ""); // 빈값 = 전체 이력(라우트가 처리)
  const [to, setTo] = useState(defaultTo || ""); // 빈값 = 오늘
  const [quantile, setQuantile] = useState(0.2);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState("");

  const run = async () => {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams({
        market,
        from,
        to,
        quantile: String(quantile),
        principal: String(principal),
        contribution: String(monthlyContribution),
      });
      const r = await fetch(`/api/admin/backtest/factor?${qs}`);
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

  // focus 팩터 + 벤치마크(동일가중·시장ETF)만 표시.
  const shown = data ? data.strategies.filter((s) => s.key === focus || s.key === "equal_weight" || s.key === "market") : [];
  const focusStrat = data?.strategies.find((s) => s.key === focus);

  // focus 팩터의 비교 항목(곡선은 시작=1 재기준 — 브라우저 entryFromResult 와 동일).
  const buildEntry = (d: Resp, fs: Strat): CompareEntry => {
    const base = fs.equityCurve[0]?.equity || 1;
    const extra = d.contribution > 0 ? ` · 월적립 ${d.contribution.toLocaleString()}` : "";
    return {
      label: `팩터: ${fs.name}`,
      sub: `${d.universe} · ${d.from}~${d.to} · 분위${Math.round(d.quantile * 100)}%${extra}`,
      curve: fs.equityCurve.map((p) => ({ date: p.date, v: base > 0 ? p.equity / base : 0 })),
      metrics: fs.metrics as BacktestMetrics,
    };
  };
  const entry: CompareEntry | null = focusStrat && data ? buildEntry(data, focusStrat) : null;

  // 재실행(데이터 갱신) 시 담겨 있으면 새 결과로 갱신.
  useEffect(() => {
    if (inCompare && focusStrat && data) onSetCompare(buildEntry(data, focusStrat));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const chart: EChartsOption | null = shown.length
    ? {
        tooltip: { trigger: "axis" },
        // 범례는 위 표(전략명=선 색상)가 대신하므로 차트엔 두지 않는다(중복·겹침 제거).
        grid: { left: 8, right: 14, top: 12, bottom: 8, containLabel: true },
        xAxis: { type: "category", data: shown[0].equityCurve.map((p) => p.date), boundaryGap: false, axisLabel: { color: "#888", hideOverlap: true } },
        yAxis: { type: "value", scale: true, axisLabel: { color: "#888" } },
        series: shown.map((s) => ({
          name: s.name,
          type: "line",
          showSymbol: false,
          sampling: "lttb",
          lineStyle: { width: s.key === focus ? 2.5 : 1.4, color: COLORS[s.key] },
          itemStyle: { color: COLORS[s.key] },
          data: s.equityCurve.map((p) => Number(p.equity.toFixed(4))),
        })),
      }
    : null;

  return (
    <div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
        팩터는 <b>유니버스 전체</b>를 팩터로 랭킹해 상위 분위를 담는 포트폴리오라 단일 종목이 아니라 <b>시장(유니버스) 선택</b>입니다.
        시작/종료를 비우면 다른 탭처럼 <b>전체 이력~오늘</b>. 원금·월적립금은 다른 전략 탭과 공유됩니다.
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
          원금
          <input type="number" min={0} step={1000} value={principal} onChange={(e) => onPrincipal(Number(e.target.value))} className="block border border-gray-300 dark:border-gray-600 rounded px-2 py-1 w-28 dark:bg-gray-800" />
        </label>
        <label className="text-sm">
          월적립금
          <input type="number" min={0} step={100} value={monthlyContribution} onChange={(e) => onMonthly(Number(e.target.value))} className="block border border-gray-300 dark:border-gray-600 rounded px-2 py-1 w-28 dark:bg-gray-800" />
        </label>
        <label className="text-sm">
          분위
          <input type="number" min={0.05} max={0.5} step={0.05} value={quantile} onChange={(e) => setQuantile(Number(e.target.value))} className="block border border-gray-300 dark:border-gray-600 rounded px-2 py-1 w-20 dark:bg-gray-800" />
        </label>
        <button onClick={run} disabled={loading} className="py-2 px-4 rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? "실행 중…" : "백테스트 실행"}
        </button>
        {entry && (
          <label className="flex items-center gap-1 text-sm cursor-pointer">
            <input type="checkbox" checked={inCompare} onChange={() => onSetCompare(inCompare ? null : entry)} />
            비교에 추가
          </label>
        )}
      </div>

      {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
      {loading && <p className="text-gray-500 text-sm">유니버스 로드·연산 중 (수십 초 걸릴 수 있음)…</p>}

      {data && (
        <>
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            {data.universe} · 로드종목 {data.universeSize} · 분위 {Math.round(data.quantile * 100)}% · {data.from}~{data.to}
            {data.contribution > 0
              ? ` · 원금 ${data.principal.toLocaleString()} + 월적립 ${data.contribution.toLocaleString()}`
              : ` · 원금 ${data.principal.toLocaleString()}`}
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
                {shown.map((s) => (
                  <tr key={s.key} className={"border-b border-gray-100 dark:border-gray-800 " + (s.key === focus ? "font-semibold" : "")}>
                    <td className="py-2 pr-4" style={{ color: COLORS[s.key] }}>
                      {s.name}
                      {s.key === focus ? " ★" : ""}
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
          {data.contribution > 0 && focusStrat?.metrics.totalContributed !== undefined && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              적립식(TWR 지표) · 총 투입 {Math.round(focusStrat.metrics.totalContributed).toLocaleString()} → 최종 {Math.round(focusStrat.metrics.final).toLocaleString()}
            </p>
          )}
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
