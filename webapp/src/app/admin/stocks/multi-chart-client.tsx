"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { X } from "lucide-react";

type StockMeta = {
  ticker: string;
  name: string;
  market: "KR" | "US";
  indices?: string[];
};

type SeriesPoint = { date: string; close: number };

type PricesResponse = {
  byTicker: Record<string, SeriesPoint[]>;
  requested: string[];
  missing: string[];
  from: string;
  to: string;
};

type Trade = {
  date: string;
  time: string;
  action: "buy" | "sell";
  price: number;
  qty: number;
  env: "paper" | "real";
};

type TradesResponse = { byTicker: Record<string, Trade[]> };

type Props = { stocks: StockMeta[] };

const COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#ea580c",
  "#9333ea", "#0891b2", "#ca8a04", "#db2777",
];
const MAX_SELECTED = 8;

function parseTickersFromUrl(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map((t) => t.trim()).filter(Boolean).slice(0, MAX_SELECTED);
}

function normalizeSeries(series: SeriesPoint[]): SeriesPoint[] {
  if (series.length === 0) return series;
  const base = series[0].close;
  if (!base) return series;
  return series.map((p) => ({ date: p.date, close: (p.close / base) * 100 }));
}

function sma(series: SeriesPoint[], window: number): Array<[string, number | null]> {
  const out: Array<[string, number | null]> = [];
  for (let i = 0; i < series.length; i++) {
    if (i < window - 1) {
      out.push([series[i].date, null]);
      continue;
    }
    let sum = 0;
    for (let k = i - window + 1; k <= i; k++) sum += series[k].close;
    out.push([series[i].date, sum / window]);
  }
  return out;
}

type Market = "KR" | "US";

export default function MultiChartClient({ stocks }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  // 시장별 분리된 선택 — KR 과 US 는 통화 다름. 한 차트에 섞으면 의미 없음.
  // URL: ?kr=AAPL,005930&us=... (각 시장 ticker 자체로 자연 구분되나 명시).
  // ticker → market 빠른 조회 (legacy ?tickers= 분리용)
  const marketOf = useMemo(() => {
    const m: Record<string, Market> = {};
    for (const s of stocks) m[s.ticker] = s.market;
    return m;
  }, [stocks]);

  const [market, setMarket] = useState<Market>(() => {
    const m = sp.get("market");
    if (m === "us" || m === "US") return "US";
    if (m === "kr" || m === "KR") return "KR";
    if (sp.get("us") && !sp.get("kr")) return "US";
    return "KR";
  });
  const [selectedKr, setSelectedKr] = useState<string[]>(() => {
    const explicit = parseTickersFromUrl(sp.get("kr"));
    if (explicit.length) return explicit;
    // legacy ?tickers= 호환 — 시장별 자동 분류
    const legacy = parseTickersFromUrl(sp.get("tickers"));
    return legacy.filter((t) => marketOf[t] === "KR");
  });
  const [selectedUs, setSelectedUs] = useState<string[]>(() => {
    const explicit = parseTickersFromUrl(sp.get("us"));
    if (explicit.length) return explicit;
    const legacy = parseTickersFromUrl(sp.get("tickers"));
    return legacy.filter((t) => marketOf[t] === "US");
  });
  const selected = market === "KR" ? selectedKr : selectedUs;
  const setSelected = market === "KR" ? setSelectedKr : setSelectedUs;

  const [normalize, setNormalize] = useState(false);
  const [showMA, setShowMA] = useState(true);
  const [showTrades, setShowTrades] = useState(true);
  const [byTicker, setByTicker] = useState<Record<string, SeriesPoint[]>>({});
  const [tradesByTicker, setTradesByTicker] = useState<Record<string, Trade[]>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const metaByTicker = useMemo(() => {
    const m: Record<string, StockMeta> = {};
    for (const s of stocks) m[s.ticker] = s;
    return m;
  }, [stocks]);

  // 자동완성 — 현재 active market 의 종목만
  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    const out: StockMeta[] = [];
    for (const s of stocks) {
      if (s.market !== market) continue;
      if (selected.includes(s.ticker)) continue;
      if (s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) {
        out.push(s);
        if (out.length >= 20) break;
      }
    }
    return out;
  }, [input, stocks, selected, market]);

  useEffect(() => {
    const params = new URLSearchParams(sp.toString());
    // legacy ?tickers= 정리
    params.delete("tickers");
    if (selectedKr.length === 0) params.delete("kr");
    else params.set("kr", selectedKr.join(","));
    if (selectedUs.length === 0) params.delete("us");
    else params.set("us", selectedUs.join(","));
    params.set("market", market.toLowerCase());
    const next = params.toString();
    if (next !== sp.toString()) {
      router.replace(`?${next}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKr, selectedUs, market]);

  useEffect(() => {
    if (selected.length === 0) {
      setByTicker({});
      setTradesByTicker({});
      setMissing([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const enc = encodeURIComponent(selected.join(","));
    Promise.all([
      fetch(`/api/admin/stocks/prices?tickers=${enc}`).then(
        (r) => r.json() as Promise<PricesResponse>,
      ),
      fetch(`/api/admin/stocks/trades?tickers=${enc}`).then(
        (r) => r.json() as Promise<TradesResponse>,
      ),
    ])
      .then(([prices, trades]) => {
        if (cancelled) return;
        setByTicker(prices.byTicker ?? {});
        setMissing(prices.missing ?? []);
        setTradesByTicker(trades.byTicker ?? {});
      })
      .catch(() => {
        if (cancelled) return;
        setByTicker({});
        setTradesByTicker({});
        setMissing(selected);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [selected]);

  const addTicker = useCallback(
    (ticker: string) => {
      if (selected.length >= MAX_SELECTED) return;
      if (selected.includes(ticker)) return;
      if (!metaByTicker[ticker]) return;
      setSelected((prev) => [...prev, ticker]);
      setInput("");
      setShowSuggest(false);
    },
    [selected, metaByTicker],
  );

  const removeTicker = useCallback((ticker: string) => {
    setSelected((prev) => prev.filter((t) => t !== ticker));
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (suggestions.length > 0) addTicker(suggestions[0].ticker);
    },
    [suggestions, addTicker],
  );

  // ?center=YYYY-MM-DD 인식 — 매매 차트에서 클릭으로 넘어올 때 사용.
  // 차트 ready 후 dispatchAction 으로 한 번만 zoom 설정 + URL 에서 center 제거 →
  // 이후 사용자 zoom 변경은 보존.
  const centerDate = sp.get("center");

  const echartsOption = useMemo<EChartsOption | null>(() => {
    if (selected.length === 0) return null;
    // 종목별 series — close + SMA20 + SMA60 + 매수 marker + 매도 marker.
    type ESeries = NonNullable<EChartsOption["series"]>;
    const series: ESeries = [];
    const legendData: string[] = [];

    // xAxis 의 category data 명시 — echarts 가 series 등장 순서로 자동 수집하면
    // 종목별 휴장일 차이로 순서가 깨짐. union dates sort 후 명시.
    const dateSet = new Set<string>();
    for (const t of selected) {
      for (const p of byTicker[t] ?? []) dateSet.add(p.date);
      for (const tr of tradesByTicker[t] ?? []) dateSet.add(tr.date);
    }
    const xAxisDates = Array.from(dateSet).sort();

    for (let i = 0; i < selected.length; i++) {
      const t = selected[i];
      const color = COLORS[i % COLORS.length];
      const meta = metaByTicker[t];
      const rawSeries = byTicker[t] ?? [];
      const sorted = rawSeries.slice().sort((a, b) => a.date.localeCompare(b.date));
      const transformed = normalize ? normalizeSeries(sorted) : sorted;
      const closeData = transformed.map((p) => [p.date, p.close] as [string, number]);
      const labelClose = `${t} ${meta?.name ?? ""}`.trim();
      legendData.push(labelClose);

      const trades = tradesByTicker[t] ?? [];
      const base = sorted.length > 0 ? sorted[0].close : 0;
      const adj = (price: number) =>
        normalize && base ? (price / base) * 100 : price;

      const buyPoints: Array<[string, number]> = trades
        .filter((tr) => tr.action === "buy")
        .map((tr) => [tr.date, adj(tr.price)]);
      const sellPoints: Array<[string, number]> = trades
        .filter((tr) => tr.action === "sell")
        .map((tr) => [tr.date, adj(tr.price)]);

      series.push({
        type: "line",
        name: labelClose,
        data: closeData,
        showSymbol: false,
        lineStyle: { color, width: 1.5 },
        itemStyle: { color },
        emphasis: { focus: "series" },
      });

      // 매매 마커 — 별도 scatter series. legend 에는 종목 line 만 노출.
      if (showTrades && buyPoints.length > 0) {
        series.push({
          type: "scatter",
          name: `${t} 매수`,
          data: buyPoints,
          symbol: "triangle",
          symbolSize: 12,
          itemStyle: { color: "#dc2626", borderColor: "#dc2626" },
          tooltip: {
            trigger: "item",
            formatter: (p: { value: [string, number] }) =>
              `${t} 매수<br/>${p.value[0]} · ${normalize ? p.value[1].toFixed(2) : p.value[1].toLocaleString()}`,
          },
        } as never);
      }
      if (showTrades && sellPoints.length > 0) {
        series.push({
          type: "scatter",
          name: `${t} 매도`,
          data: sellPoints,
          symbol: "triangle",
          symbolRotate: 180,
          symbolSize: 12,
          itemStyle: { color: "#2563eb", borderColor: "#2563eb" },
          tooltip: {
            trigger: "item",
            formatter: (p: { value: [string, number] }) =>
              `${t} 매도<br/>${p.value[0]} · ${normalize ? p.value[1].toFixed(2) : p.value[1].toLocaleString()}`,
          },
        } as never);
      }

      if (showMA) {
        const sma20 = sma(transformed, 20);
        const sma60 = sma(transformed, 60);
        series.push({
          type: "line",
          name: `${t} SMA20`,
          data: sma20.map(([d, v]) => [d, v]),
          showSymbol: false,
          lineStyle: { color, width: 1, type: "dotted", opacity: 0.8 },
          itemStyle: { color },
          tooltip: { show: false },
        } as never);
        series.push({
          type: "line",
          name: `${t} SMA60`,
          data: sma60.map(([d, v]) => [d, v]),
          showSymbol: false,
          lineStyle: { color, width: 1, type: "dashed", opacity: 0.6 },
          itemStyle: { color },
          tooltip: { show: false },
        } as never);
      }
    }

    return {
      animation: false,
      legend: {
        data: legendData,
        bottom: 0,
        textStyle: { fontSize: 11 },
      },
      grid: { left: 60, right: 16, top: 16, bottom: 72 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
      },
      xAxis: {
        type: "category",
        data: xAxisDates,
        axisLabel: { fontSize: 11 },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: {
          fontSize: 11,
          formatter: (v: number) => (normalize ? v.toFixed(0) : v.toLocaleString()),
        },
      },
      dataZoom: [
        { type: "inside", zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: false },
      ],
      series,
    };
  }, [selected, byTicker, tradesByTicker, normalize, showMA, showTrades, metaByTicker]);

  return (
    <div>
      {/* 시장 탭 — KR / US 분리. 통화가 다른 종목 한 차트 섞임 방지. */}
      <div className="flex border-b mb-4">
        {(["KR", "US"] as const).map((m) => {
          const count = m === "KR" ? selectedKr.length : selectedUs.length;
          const active = market === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMarket(m);
                setInput("");
                setShowSuggest(false);
              }}
              className={
                "px-4 py-2 text-sm border-b-2 -mb-px transition " +
                (active
                  ? "border-blue-600 text-blue-600 font-medium"
                  : "border-transparent text-gray-500 hover:text-gray-700")
              }
              aria-label={`${m === "KR" ? "국장" : "미장"} 탭`}
            >
              {m === "KR" ? "국장 (KRW)" : "미장 (USD)"}
              {count > 0 && (
                <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-700 rounded-full px-2 py-0.5">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="w-full h-[520px] mb-6">
        {selected.length === 0 || !echartsOption ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400 border border-dashed rounded">
            아래에서 종목을 추가하면 차트가 그려집니다.
          </div>
        ) : (
          <ReactECharts
            option={echartsOption}
            style={{ width: "100%", height: "100%" }}
            notMerge
            lazyUpdate
            onChartReady={(chart) => {
              if (!centerDate) return;
              const d = new Date(centerDate);
              if (isNaN(d.getTime())) return;
              const before = new Date(d.getTime() - 30 * 86400 * 1000);
              const after = new Date(d.getTime() + 30 * 86400 * 1000);
              const fmt = (x: Date) => x.toISOString().slice(0, 10);
              (chart as unknown as {
                dispatchAction: (a: { type: string; [k: string]: unknown }) => void;
              }).dispatchAction({
                type: "dataZoom",
                startValue: fmt(before),
                endValue: fmt(after),
              });
              // center 한 번 적용 후 URL 정리 — 이후 사용자 zoom 보존
              const params = new URLSearchParams(sp.toString());
              params.delete("center");
              router.replace(`?${params.toString()}`, { scroll: false });
            }}
          />
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 min-h-[36px]">
          {selected.length === 0 ? (
            <span className="text-sm text-gray-400">선택된 종목 없음</span>
          ) : (
            selected.map((t, i) => {
              const meta = metaByTicker[t];
              return (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs"
                  style={{
                    backgroundColor: `${COLORS[i % COLORS.length]}1a`,
                    border: `1px solid ${COLORS[i % COLORS.length]}`,
                  }}
                >
                  <span className="font-mono">{t}</span>
                  {meta && <span className="text-gray-500">{meta.name}</span>}
                  {missing.includes(t) && (
                    <span className="text-amber-600">(데이터 없음)</span>
                  )}
                  <button
                    type="button"
                    aria-label={`${t} 제거`}
                    onClick={() => removeTicker(t)}
                    className="ml-1 hover:opacity-70"
                  >
                    <X size={12} />
                  </button>
                </span>
              );
            })
          )}
        </div>

        <form onSubmit={handleSubmit} className="relative">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setShowSuggest(true);
            }}
            onFocus={() => setShowSuggest(true)}
            onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
            placeholder={
              selected.length >= MAX_SELECTED
                ? `최대 ${MAX_SELECTED} 종목`
                : `${market === "KR" ? "국장" : "미장"} 종목 검색 (티커 또는 이름)`
            }
            disabled={selected.length >= MAX_SELECTED}
            className="w-full px-3 py-2 border rounded text-sm dark:bg-gray-900 disabled:opacity-50"
          />
          {showSuggest && suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border rounded shadow-lg text-sm">
              {suggestions.map((s) => (
                <li key={s.ticker}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addTicker(s.ticker)}
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <span className="font-mono text-xs text-gray-500 w-16">
                      {s.ticker}
                    </span>
                    <span className="flex-1">{s.name}</span>
                    <span className="text-xs text-gray-400">
                      {(s.indices ?? []).join(", ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={normalize}
              onChange={(e) => setNormalize(e.target.checked)}
            />
            <span>정규화 (시작가=100)</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showMA}
              onChange={(e) => setShowMA(e.target.checked)}
            />
            <span>이동평균선 (SMA 20/60)</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showTrades}
              onChange={(e) => setShowTrades(e.target.checked)}
            />
            <span>
              매매 마커 (<span className="text-red-600">▲</span> 매수 /{" "}
              <span className="text-blue-600">▼</span> 매도)
            </span>
          </label>
          {loading && <span className="text-gray-400">로딩 중...</span>}
          {!loading && selected.length > 0 && missing.length === selected.length && (
            <span className="text-amber-600">
              데이터가 없습니다 — 백필 후 표시됩니다.
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400">
          차트에서 마우스 휠로 확대/축소 · 잡고 드래그로 기간 이동
        </p>
      </div>
    </div>
  );
}
