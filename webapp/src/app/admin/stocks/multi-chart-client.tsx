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
  strategy?: string; // "infinite" | "trend" 등. 전략 구분(마커 모양).
  price: number;
  qty: number;
  cumulativeQty?: number; // 체결 후 누적 보유 수량.
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

// 기간 프리셋 — months: 조회 창, tick: 자동 틱(일 D / 주 W / 월 M). 기본 월(1M).
type RangeKey = "1M" | "3M" | "1Y" | "3Y" | "5Y" | "10Y";
type Tick = "D" | "W" | "M";
const RANGES: { key: RangeKey; label: string; months: number; tick: Tick }[] = [
  { key: "1M", label: "월", months: 1, tick: "D" },
  { key: "3M", label: "분기", months: 3, tick: "D" },
  { key: "1Y", label: "년", months: 12, tick: "D" },
  { key: "3Y", label: "3년", months: 36, tick: "W" },
  { key: "5Y", label: "5년", months: 60, tick: "W" },
  { key: "10Y", label: "10년", months: 120, tick: "M" },
];

// SMA60(60거래일) warmup — 이동평균은 항상 일봉 60거래일 기준이라 틱과 무관하게 고정.
// 60거래일 ≈ 3개월, 휴장 여유로 4개월.
const SMA_WARMUP_MONTHS = 4;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addMonths(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + delta);
  return ymd(d);
}

// 일봉을 틱 버킷의 마지막 값으로 다운샘플(실제 날짜 보존). 주봉=월요일 키, 월봉=YYYY-MM.
function bucketKey(date: string, tick: Tick): string {
  if (tick === "D") return date;
  if (tick === "M") return date.slice(0, 7);
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // 주 시작(월)
  return ymd(d);
}

function downsample(series: SeriesPoint[], tick: Tick): SeriesPoint[] {
  if (tick === "D") return series;
  const sorted = series.slice().sort((a, b) => a.date.localeCompare(b.date));
  const lastByBucket = new Map<string, SeriesPoint>();
  for (const p of sorted) lastByBucket.set(bucketKey(p.date, tick), p); // 버킷 마지막 값
  return Array.from(lastByBucket.values()).sort((a, b) => a.date.localeCompare(b.date));
}

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
  const [range, setRange] = useState<RangeKey>("1M"); // 기본 월 보기
  const [anchorEnd, setAnchorEnd] = useState<string>(() => ymd(new Date())); // 창 우측 끝(이동 기준)
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
    // 기간 → 조회 창(from/to). anchorEnd 가 우측 끝(chevron 이동 기준).
    // limit 은 일봉 기준 창 크기를 덮도록(API 가 5000 캡).
    const cfg = RANGES.find((r) => r.key === range) ?? RANGES[0];
    const to = anchorEnd;
    const from = addMonths(to, -cfg.months);
    // SMA60(60거래일)이 보이는 구간 시작부터 연속되도록 prices 는 warmup 만큼 더 받는다.
    const warmup = SMA_WARMUP_MONTHS;
    const priceFrom = addMonths(from, -warmup);
    const priceLimit = Math.min(5000, (cfg.months + warmup) * 31 + 5);
    const tradeLimit = Math.min(5000, cfg.months * 31 + 5);
    Promise.all([
      fetch(
        `/api/admin/stocks/prices?tickers=${enc}&from=${priceFrom}&to=${to}&limit=${priceLimit}`,
      ).then((r) => r.json() as Promise<PricesResponse>),
      fetch(
        `/api/admin/stocks/trades?tickers=${enc}&from=${from}&to=${to}&limit=${tradeLimit}`,
      ).then((r) => r.json() as Promise<TradesResponse>),
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
  }, [selected, range, anchorEnd]);

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

    // 기간별 자동 틱으로 다운샘플(일/주/월). dsByTicker 는 warmup 포함(SMA 연속용),
    // winFrom 이전은 화면에서 가린다. 종목별로 한 번 계산해 축·시리즈에 공유.
    const rcfg = RANGES.find((r) => r.key === range) ?? RANGES[0];
    const tick = rcfg.tick;
    const winFrom = addMonths(anchorEnd, -rcfg.months); // 보이는 구간 시작
    const dsByTicker: Record<string, SeriesPoint[]> = {};
    for (const t of selected) dsByTicker[t] = downsample(byTicker[t] ?? [], tick);

    // xAxis 의 category data 명시 — echarts 가 series 등장 순서로 자동 수집하면
    // 종목별 휴장일 차이로 순서가 깨짐. union dates sort 후 명시. 보이는 구간만.
    const dateSet = new Set<string>();
    for (const t of selected) {
      for (const p of dsByTicker[t]) if (p.date >= winFrom) dateSet.add(p.date);
      for (const tr of tradesByTicker[t] ?? []) if (tr.date >= winFrom) dateSet.add(tr.date);
    }
    const xAxisDates = Array.from(dateSet).sort();

    for (let i = 0; i < selected.length; i++) {
      const t = selected[i];
      const color = COLORS[i % COLORS.length];
      const meta = metaByTicker[t];
      // 가격선은 틱 다운샘플. 이동평균선은 보기(주/월봉)와 무관하게 *항상 일봉 기준
      // 20/60 거래일*로 계산해 tick 날짜에 샘플 → 어느 기간이든 동일한 20일선·60일선.
      const dsFull = (dsByTicker[t] ?? [])
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date));
      const dailyFull = (byTicker[t] ?? [])
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date));
      const firstVisible =
        dailyFull.find((p) => p.date >= winFrom) ?? dsFull.find((p) => p.date >= winFrom);
      const base = normalize ? firstVisible?.close ?? dailyFull[0]?.close ?? 0 : 0;
      const adj = (price: number) => (normalize && base ? (price / base) * 100 : price);
      const closeData = dsFull
        .filter((p) => p.date >= winFrom)
        .map((p) => [p.date, adj(p.close)] as [string, number]);
      // 일봉 SMA(20/60 거래일) → 날짜별 맵(tick 날짜에 샘플하기 위함).
      const normDaily: SeriesPoint[] = dailyFull.map((p) => ({ date: p.date, close: adj(p.close) }));
      const ma20Map = new Map(sma(normDaily, 20));
      const ma60Map = new Map(sma(normDaily, 60));
      const labelClose = `${t} ${meta?.name ?? ""}`.trim();
      legendData.push(labelClose);

      const trades = (tradesByTicker[t] ?? []).filter((tr) => tr.date >= winFrom);

      series.push({
        type: "line",
        name: labelClose,
        data: closeData,
        showSymbol: false,
        lineStyle: { color, width: 1.5 },
        itemStyle: { color },
        emphasis: { focus: "series" },
      });

      // 매매 마커 — 색=매수(빨강)/매도(파랑), 모양=전략(무한매수 ▲ / 추세 ◆ / 기타 ●).
      // 전략별로 scatter series 를 나눠 모양과 툴팁으로 구분한다. legend 엔 종목 line 만 노출.
      const stratSymbol = (s?: string) =>
        s === "infinite" ? "triangle" : s === "trend" ? "diamond" : "circle";
      const stratLabel = (s?: string) =>
        s === "infinite" ? "무한매수" : s === "trend" ? "추세추종" : "기타";
      type MarkerPoint = { value: [string, number]; qty: number; cum: number };
      const pushMarkers = (action: "buy" | "sell", clr: string, krLabel: string) => {
        const group: Record<string, MarkerPoint[]> = {};
        for (const tr of trades) {
          if (tr.action !== action) continue;
          const key = tr.strategy ?? "";
          (group[key] ??= []).push({
            value: [tr.date, adj(tr.price)],
            qty: tr.qty,
            cum: tr.cumulativeQty ?? 0,
          });
        }
        for (const [strat, pts] of Object.entries(group)) {
          if (pts.length === 0) continue;
          series.push({
            type: "scatter",
            name: `${t} ${krLabel} ${stratLabel(strat)}`,
            data: pts,
            symbol: stratSymbol(strat),
            symbolRotate: action === "sell" && stratSymbol(strat) === "triangle" ? 180 : 0,
            symbolSize: 12,
            itemStyle: { color: clr, borderColor: clr },
            tooltip: {
              trigger: "item",
              formatter: (p: { data: MarkerPoint }) => {
                const v = p.data.value;
                const px = normalize ? v[1].toFixed(2) : v[1].toLocaleString();
                return `${t} ${krLabel} · ${stratLabel(strat)}<br/>${v[0]} · ${px}`
                  + `<br/>수량 ${p.data.qty} · 누적 ${p.data.cum}`;
              },
            },
          } as never);
        }
      };
      if (showTrades) {
        pushMarkers("buy", "#dc2626", "매수");
        pushMarkers("sell", "#2563eb", "매도");
      }

      if (showMA) {
        // 일봉 SMA 를 화면 tick 날짜에 샘플 — 보이는 구간 시작부터 연속.
        const visDates = dsFull.filter((p) => p.date >= winFrom).map((p) => p.date);
        const sma20 = visDates.map(
          (d) => [d, ma20Map.get(d) ?? null] as [string, number | null],
        );
        const sma60 = visDates.map(
          (d) => [d, ma60Map.get(d) ?? null] as [string, number | null],
        );
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
      grid: { left: 16, right: 16, top: 16, bottom: 72 },
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
        axisLabel: { show: false },   // y축 값 숨김 — 호버 시 툴팁으로 확인
      },
      dataZoom: [
        { type: "inside", zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: false },
      ],
      series,
    };
  }, [selected, byTicker, tradesByTicker, normalize, showMA, showTrades, metaByTicker, range, anchorEnd]);

  // 기간 창(표시·chevron). anchorEnd = 우측 끝, 좌/우로 기간만큼 이동(미래로는 오늘까지).
  const rangeCfg = RANGES.find((r) => r.key === range) ?? RANGES[0];
  const windowFrom = addMonths(anchorEnd, -rangeCfg.months);
  const atToday = anchorEnd >= ymd(new Date());
  const shift = (dir: -1 | 1) => {
    const today = ymd(new Date());
    setAnchorEnd((prev) => {
      const next = addMonths(prev, dir * rangeCfg.months);
      return next > today ? today : next;
    });
  };

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

      <div className="relative w-full aspect-[4/3] sm:aspect-auto sm:h-[520px] mb-6">
        {selected.length > 0 && echartsOption && (
          <>
            {/* 기간 프리셋 — 차트 우상단, 상단 경계에 50% 걸치게 위로 뺌 */}
            <div className="absolute -top-[15px] right-2 z-10 flex items-center gap-2">
              <span className="text-xs text-gray-400 tabular-nums bg-white/80 px-1 rounded">
                {windowFrom} ~ {anchorEnd}
              </span>
              <div className="inline-flex rounded-md border border-gray-300 overflow-hidden bg-white/90 text-sm shadow-sm">
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => {
                      setRange(r.key);
                      setAnchorEnd(ymd(new Date())); // 기간 바꾸면 최신 구간으로
                    }}
                    className={
                      "px-3 py-1 border-l first:border-l-0 border-gray-300 " +
                      (range === r.key
                        ? "bg-blue-600 text-white font-medium"
                        : "text-gray-600 hover:bg-gray-50")
                    }
                    title={{ D: "일봉", W: "주봉", M: "월봉" }[r.tick] + " 기준"}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            {/* chevron — 차트 좌/우 수직 중앙, 동그란 버튼 */}
            <button
              type="button"
              onClick={() => shift(-1)}
              className="absolute -left-[8px] top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full border border-gray-300 bg-white/90 text-gray-600 shadow-sm hover:bg-gray-50 flex items-center justify-center text-lg leading-none"
              title="이전 기간"
              aria-label="이전 기간"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => shift(1)}
              disabled={atToday}
              className={
                "absolute -right-[8px] top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full border border-gray-300 shadow-sm flex items-center justify-center text-lg leading-none " +
                (atToday
                  ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                  : "bg-white/90 text-gray-600 hover:bg-gray-50")
              }
              title={atToday ? "최신 구간입니다" : "다음 기간"}
              aria-label="다음 기간"
            >
              ›
            </button>
          </>
        )}
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
