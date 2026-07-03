"use client";

import { useState } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { runBacktest } from "@/lib/backtest/engine";
import { runTrendBacktest } from "@/lib/backtest/trend-engine";
import type { Bar, BacktestResult } from "@/lib/backtest/types";

type Strategy = "infinite" | "trend";
type FullResult = BacktestResult & { bars: Bar[]; principal: number; strategy: Strategy };

export default function BacktestClient() {
  const [strategy, setStrategy] = useState<Strategy>("infinite");
  // 공통
  const [ticker, setTicker] = useState("");
  const [principal, setPrincipal] = useState(4000);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // 무한매수
  const [splits, setSplits] = useState(40);
  const [takeProfitPct, setTakeProfitPct] = useState(10);
  const [locPremiumPct, setLocPremiumPct] = useState(12);
  // 추세추종
  const [shortMa, setShortMa] = useState(20);
  const [longMa, setLongMa] = useState(60);

  const [result, setResult] = useState<FullResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!ticker.trim()) {
      setError("종목 코드를 입력하세요.");
      return;
    }
    if (strategy === "trend" && shortMa >= longMa) {
      setError("단기 이동평균은 장기보다 작아야 합니다.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ ticker: ticker.trim().toUpperCase() });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/admin/backtest/prices?${params.toString()}`);
      if (!res.ok) throw new Error(`데이터 조회 실패 (${res.status})`);
      const data = await res.json();
      const bars: Bar[] = data.bars ?? [];
      if (bars.length === 0) {
        setError("해당 종목/기간의 일봉 데이터가 없습니다.");
        setResult(null);
        return;
      }
      const r =
        strategy === "infinite"
          ? runBacktest(bars, { principal, splits, takeProfitPct: takeProfitPct / 100, locPremiumPct: locPremiumPct / 100 })
          : runTrendBacktest(bars, { principal, shortMa, longMa });
      setResult({ ...r, bars, principal, strategy });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto px-4 py-8 max-w-5xl">
      <h1 className="text-2xl font-bold mb-1">백테스트</h1>
      <p className="text-sm text-gray-500 mb-4">
        과거 일봉으로 전략을 시뮬레이션합니다. 연산은 브라우저에서 실행돼 서버 부담이 없습니다.
      </p>

      {/* 전략 탭 */}
      <div className="flex gap-2 border-b mb-4">
        {([["infinite", "무한매수법"], ["trend", "추세추종"]] as const).map(([s, label]) => (
          <button
            key={s}
            type="button"
            onClick={() => { setStrategy(s); setResult(null); setError(null); }}
            className={
              "px-4 py-2 text-sm border-b-2 -mb-px transition " +
              (strategy === s ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500 hover:text-gray-700")
            }
          >
            {label}
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-400 mb-4">
        {strategy === "infinite"
          ? "원금 분할 → 1회차 시장가, 이후 평단·프리미엄 LOC 매수, 평단+익절% 전량 매도. (시장가=종가, 매수 LOC=저가 터치, 매도=고가 터치 근사)"
          : "골든크로스(단기MA>장기MA 전환)에 원금만큼 시장가 진입, 데드크로스에 전량 청산. (시장가=종가)"}
        {" 수수료·슬리피지 미반영."}
      </p>

      {/* 옵션 폼 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Field label="종목 코드" hint="예: TQQQ, 069500">
          <input value={ticker} onChange={(e) => setTicker(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="TICKER" className="input" />
        </Field>
        <Field label="원금" hint="배정 자본(국장은 원화)">
          <input type="number" value={principal} onChange={(e) => setPrincipal(Number(e.target.value))} className="input" />
        </Field>

        {strategy === "infinite" ? (
          <>
            <Field label="분할 수 (T)" hint="하루예산=원금/T">
              <input type="number" value={splits} min={1} onChange={(e) => setSplits(Number(e.target.value))} className="input" />
            </Field>
            <Field label="익절 %" hint="평단 대비">
              <input type="number" value={takeProfitPct} step={0.5} onChange={(e) => setTakeProfitPct(Number(e.target.value))} className="input" />
            </Field>
            <Field label="LOC 프리미엄 %" hint="현재가 대비 상단">
              <input type="number" value={locPremiumPct} step={0.5} onChange={(e) => setLocPremiumPct(Number(e.target.value))} className="input" />
            </Field>
          </>
        ) : (
          <>
            <Field label="단기 이동평균" hint="기본 20일">
              <input type="number" value={shortMa} min={1} onChange={(e) => setShortMa(Number(e.target.value))} className="input" />
            </Field>
            <Field label="장기 이동평균" hint="기본 60일">
              <input type="number" value={longMa} min={2} onChange={(e) => setLongMa(Number(e.target.value))} className="input" />
            </Field>
          </>
        )}

        <Field label="시작일" hint="비우면 전체">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
        </Field>
        <Field label="종료일" hint="비우면 오늘">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
        </Field>
        <div className="flex items-end">
          <button onClick={run} disabled={loading} className="w-full py-2 rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition">
            {loading ? "실행 중…" : "백테스트 실행"}
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {result && <Result result={result} />}

      <style jsx>{`
        :global(.input) { width: 100%; padding: 0.5rem; border: 1px solid rgb(209 213 219); border-radius: 0.375rem; background: transparent; font-size: 0.875rem; }
        :global(.dark .input) { border-color: rgb(75 85 99); }
      `}</style>
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-gray-400">{hint}</span>}
    </label>
  );
}

function fmt(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function Result({ result }: { result: FullResult }) {
  const buys = result.trades.filter((t) => t.side === "buy");
  const sells = result.trades.filter((t) => t.side === "sell");
  const invested = buys.reduce((s, t) => s + t.price * t.qty, 0);
  const returnPct = result.principal > 0 ? (result.totalPnl / result.principal) * 100 : 0;
  const finalEquity = result.equityCurve.at(-1)?.equity ?? 0;
  const wins = sells.filter((t) => t.pnl > 0).length;
  const winRate = sells.length > 0 ? (wins / sells.length) * 100 : 0;
  const maxRound = result.trades.reduce((m, t) => Math.max(m, t.roundNo), 0);

  const option: EChartsOption = {
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    legend: { data: ["종가", "매수", "매도"], bottom: 0 },
    grid: { left: 16, right: 16, top: 20, bottom: 44, containLabel: true },
    xAxis: { type: "category", data: result.bars.map((b) => b.date) },
    yAxis: { type: "value", scale: true },
    dataZoom: [{ type: "inside", start: 0, end: 100 }],
    series: [
      { name: "종가", type: "line", showSymbol: false, data: result.bars.map((b) => b.close), lineStyle: { width: 1.5 } },
      { name: "매수", type: "scatter", symbol: "triangle", symbolSize: 9, itemStyle: { color: "#dc2626" }, data: buys.map((t) => [t.date, t.price]), z: 5 },
      { name: "매도", type: "scatter", symbol: "triangle", symbolRotate: 180, symbolSize: 11, itemStyle: { color: "#2563eb" }, data: sells.map((t) => [t.date, t.price]), z: 6 },
    ],
  };

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Metric label="실현손익" value={fmt(result.totalPnl)} accent={result.totalPnl >= 0 ? "pos" : "neg"} />
        <Metric label="수익률 (원금 대비)" value={`${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%`} accent={returnPct >= 0 ? "pos" : "neg"} />
        {result.strategy === "infinite" ? (
          <>
            <Metric label="사이클 (익절 횟수)" value={`${sells.length}회`} />
            <Metric label="최대 도달 회차" value={`${maxRound} / ${result.trades.length}건`} />
            <Metric label="총 매수 금액" value={fmt(invested)} />
          </>
        ) : (
          <>
            <Metric label="매매 사이클 (청산)" value={`${sells.length}회`} />
            <Metric label="승률" value={`${winRate.toFixed(0)}% (${wins}/${sells.length})`} accent={winRate >= 50 ? "pos" : "neg"} />
            <Metric label="진입/청산" value={`${buys.length}/${sells.length}건`} />
          </>
        )}
        <Metric label="현재 보유 평가액" value={fmt(finalEquity)} />
        <Metric label="일봉 기간" value={`${result.bars[0]?.date} ~ ${result.bars.at(-1)?.date}`} />
        <Metric label="바 수" value={`${result.bars.length}일`} />
      </div>

      <div className="w-full aspect-[4/3] sm:aspect-auto sm:h-[400px] mb-6">
        <ReactECharts option={option} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
      </div>

      <h2 className="text-lg font-semibold mb-3">거래 내역 ({result.trades.length}건)</h2>
      <div className="overflow-x-auto max-h-96 overflow-y-auto border border-gray-100 dark:border-gray-800 rounded">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-white dark:bg-gray-900">
            <tr className="border-b text-gray-500 text-left">
              <th className="py-2 px-3">날짜</th>
              <th className="py-2 px-3">구분</th>
              <th className="py-2 px-3 text-right">가격</th>
              <th className="py-2 px-3 text-right">수량</th>
              <th className="py-2 px-3 text-right">실현손익</th>
              {result.strategy === "infinite" && <th className="py-2 px-3 text-right">회차</th>}
            </tr>
          </thead>
          <tbody>
            {result.trades.map((t, i) => (
              <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-1.5 px-3 whitespace-nowrap">{t.date}</td>
                <td className={`py-1.5 px-3 font-medium ${t.side === "buy" ? "text-red-600" : "text-blue-600"}`}>
                  {t.side === "buy" ? "▲ 매수" : "▼ 매도"}
                </td>
                <td className="py-1.5 px-3 text-right">{fmt(t.price)}</td>
                <td className="py-1.5 px-3 text-right">{t.qty.toLocaleString()}</td>
                <td className={`py-1.5 px-3 text-right ${t.pnl > 0 ? "text-red-600" : t.pnl < 0 ? "text-blue-600" : "text-gray-400"}`}>
                  {t.side === "sell" ? fmt(t.pnl) : "—"}
                </td>
                {result.strategy === "infinite" && <td className="py-1.5 px-3 text-right text-gray-500">{t.roundNo}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: "pos" | "neg" }) {
  const color = accent === "pos" ? "text-red-600" : accent === "neg" ? "text-blue-600" : "text-gray-900 dark:text-white";
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}
