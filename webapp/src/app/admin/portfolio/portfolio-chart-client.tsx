"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

type HistoryPoint = {
  dateStr: string;
  totalValue: number;
  cash: number;
  holdingsValue: number;
  cumulativePnl: number;
};

type TradeStats = {
  buy: number;
  sell: number;
  buyAmount: number;
  sellAmount: number;
  buyTickers: string[];
  sellTickers: string[];
};

type PortfolioResponse = {
  env: "paper" | "real";
  currency: "KRW" | "USD";
  history: HistoryPoint[];
  tradesByDate: Record<string, TradeStats>;
};

type Env = "paper" | "real";
type Currency = "KRW" | "USD";

function formatMoney(v: number, currency: Currency): string {
  if (currency === "USD") {
    return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${Math.round(v).toLocaleString()}원`;
}

export default function PortfolioChartClient({ initialData }: { initialData?: PortfolioResponse }) {
  const router = useRouter();
  const [env, setEnv] = useState<Env>("paper");
  const [currency, setCurrency] = useState<Currency>("KRW");
  const [data, setData] = useState<PortfolioResponse | null>(initialData ?? null);
  const [loading, setLoading] = useState(false);
  // SSR(page.tsx)로 기본(paper,KRW) 데이터가 주입되면 첫 fetch 를 건너뛴다. 이후 탭 변경은 fetch.
  const skipNextFetch = useRef(!!initialData);

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/portfolio?env=${env}&currency=${currency}`)
      .then((r) => r.json() as Promise<PortfolioResponse>)
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [env, currency]);

  // 해당 (env,currency)에 매매가 한 건이라도 있는지. 매매 없는 시장은 라인을 숨긴다
  // (포트폴리오 스냅샷은 매매와 무관하게 매일 쌓이므로, 매매 0건이면 차트가 의미 없다).
  const hasTrades = !!data && Object.keys(data.tradesByDate ?? {}).length > 0;

  const option = useMemo<EChartsOption | null>(() => {
    if (!data || data.history.length === 0) return null;
    if (Object.keys(data.tradesByDate ?? {}).length === 0) return null; // 매매 없는 시장 숨김

    const dates = data.history.map((h) => h.dateStr);
    const totalData = data.history.map((h) => h.totalValue);
    const cashData = data.history.map((h) => h.cash);
    const holdingsData = data.history.map((h) => h.holdingsValue);

    // 매매 마커 — totalValue line 위에 표시.
    // 매수만: ▲ 빨강 / 매도만: ▼ 파랑 / 둘 다: ■ 보라.
    type ESeries = NonNullable<EChartsOption["series"]>;
    const buyOnly: Array<[string, number]> = [];
    const sellOnly: Array<[string, number]> = [];
    const both: Array<[string, number]> = [];
    const tradeMeta: Record<string, TradeStats> = data.tradesByDate;

    for (const h of data.history) {
      const stats = tradeMeta[h.dateStr];
      if (!stats) continue;
      const point: [string, number] = [h.dateStr, h.totalValue];
      if (stats.buy > 0 && stats.sell > 0) both.push(point);
      else if (stats.buy > 0) buyOnly.push(point);
      else if (stats.sell > 0) sellOnly.push(point);
    }

    const markerTooltipFormatter = (
      p: { value: [string, number] },
    ) => {
      const d = p.value[0];
      const stats = tradeMeta[d];
      if (!stats) return `${d}<br/>매매 없음`;
      const lines = [`<b>${d}</b>`];
      if (stats.buy > 0) {
        lines.push(
          `▲ 매수 ${stats.buy}건 · ${formatMoney(stats.buyAmount, currency)}`,
        );
      }
      if (stats.sell > 0) {
        lines.push(
          `▼ 매도 ${stats.sell}건 · ${formatMoney(stats.sellAmount, currency)}`,
        );
      }
      const tv = data.history.find((h) => h.dateStr === d);
      if (tv) {
        lines.push(`총자산 ${formatMoney(tv.totalValue, currency)}`);
      }
      return lines.join("<br/>");
    };

    const series: ESeries = [
      {
        type: "line",
        name: "추정 총 재산",
        data: totalData,
        showSymbol: false,
        smooth: false,
        lineStyle: { color: "#2563eb", width: 2 },
        itemStyle: { color: "#2563eb" },
      },
      {
        type: "line",
        name: "추정 잔여 현금",
        data: cashData,
        showSymbol: false,
        lineStyle: { color: "#16a34a", width: 1.5, type: "dashed" },
        itemStyle: { color: "#16a34a" },
      },
      {
        type: "line",
        name: "보유 평가액",
        data: holdingsData,
        showSymbol: false,
        lineStyle: { color: "#ea580c", width: 1.5, type: "dashed" },
        itemStyle: { color: "#ea580c" },
      },
    ];

    if (buyOnly.length) {
      series.push({
        type: "scatter",
        name: "▲ 매수만",
        data: buyOnly,
        symbol: "triangle",
        symbolSize: 12,
        itemStyle: { color: "#dc2626", borderColor: "#dc2626" },
        tooltip: { trigger: "item", formatter: markerTooltipFormatter },
      } as never);
    }
    if (sellOnly.length) {
      series.push({
        type: "scatter",
        name: "▼ 매도만",
        data: sellOnly,
        symbol: "triangle",
        symbolRotate: 180,
        symbolSize: 12,
        itemStyle: { color: "#2563eb", borderColor: "#2563eb" },
        tooltip: { trigger: "item", formatter: markerTooltipFormatter },
      } as never);
    }
    if (both.length) {
      series.push({
        type: "scatter",
        name: "■ 매수+매도",
        data: both,
        symbol: "rect",
        symbolSize: 11,
        itemStyle: { color: "#9333ea", borderColor: "#9333ea" },
        tooltip: { trigger: "item", formatter: markerTooltipFormatter },
      } as never);
    }

    return {
      animation: false,
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      grid: { left: 24, right: 16, top: 16, bottom: 72 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        // axis tooltip 에 매매 통계 함께 표시 — 마커 hover 안 해도 같은 줄에 노출.
        formatter: ((
          params: Array<{
            axisValue?: string;
            seriesName?: string;
            value?: number | [string, number];
            color?: string;
          }>,
        ) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const date = String(params[0].axisValue ?? "");
          const lines = [`<b>${date}</b>`];
          for (const p of params) {
            // scatter (매수/매도/둘다) series 는 axis tooltip 에서 중복 노출 회피
            const n = p.seriesName ?? "";
            if (n.startsWith("▲") || n.startsWith("▼") || n.startsWith("■")) continue;
            const raw = p.value;
            const v = Array.isArray(raw) ? Number(raw[1]) : Number(raw);
            if (!Number.isFinite(v)) continue;
            lines.push(
              `<span style="display:inline-block;width:8px;height:8px;background:${p.color};border-radius:50%;margin-right:4px;"></span>${n}: ${formatMoney(v, currency)}`,
            );
          }
          const stats = tradeMeta[date];
          if (stats) {
            if (stats.buy > 0) {
              lines.push(
                `<span style="color:#dc2626">▲ 매수 ${stats.buy}건 · ${formatMoney(stats.buyAmount, currency)}</span>`,
              );
            }
            if (stats.sell > 0) {
              lines.push(
                `<span style="color:#2563eb">▼ 매도 ${stats.sell}건 · ${formatMoney(stats.sellAmount, currency)}</span>`,
              );
            }
            if (stats.buy > 0 || stats.sell > 0) {
              lines.push(
                `<span style="color:#9333ea;font-size:11px">(클릭 → 종목 차트)</span>`,
              );
            }
          }
          return lines.join("<br/>");
        }) as never,
      },
      xAxis: {
        type: "category",
        data: dates,
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
  }, [data, currency]);

  // 차트 클릭 → 그 날 매매 종목 list 가 있으면 종목 차트로 이동.
  // currency 에 따라 market (KR/US) 자동 분기. center 쿼리로 그 날짜 중앙 표시.
  const handleChartClick = (params: { name?: string; value?: unknown; data?: unknown }) => {
    if (!data) return;
    // params.name 은 category axis 라벨 (dateStr) — line series click 시 사용.
    // scatter series 는 value: [date, total] 또는 data: [date, total].
    let date: string | null = null;
    if (typeof params.name === "string" && params.name) date = params.name;
    else if (Array.isArray(params.value) && typeof params.value[0] === "string") date = params.value[0];
    else if (Array.isArray(params.data) && typeof params.data[0] === "string") date = params.data[0] as string;
    if (!date) return;
    const stats = data.tradesByDate[date];
    if (!stats) return;
    const tickers = Array.from(new Set([...stats.buyTickers, ...stats.sellTickers]));
    if (tickers.length === 0) return;
    // 매매 상세 페이지로 이동 — 그 env·통화의 매매 종목 주가+마커 차트와 매매/포트폴리오 표.
    const params2 = new URLSearchParams({ env, currency, center: date });
    router.push(`/admin/portfolio/detail?${params2.toString()}`);
  };

  return (
    <div>
      {/* env × currency 탭 */}
      <div className="flex flex-wrap gap-2 border-b mb-4">
        {(["paper", "real"] as const).map((e) =>
          (["KRW", "USD"] as const).map((c) => {
            const active = env === e && currency === c;
            const label = `${e === "paper" ? "모의" : "실전"} · ${c === "KRW" ? "국장" : "미장"}`;
            return (
              <button
                key={`${e}-${c}`}
                type="button"
                onClick={() => {
                  setEnv(e);
                  setCurrency(c);
                }}
                className={
                  "px-3 py-2 text-sm border-b-2 -mb-px transition " +
                  (active
                    ? "border-blue-600 text-blue-600 font-medium"
                    : "border-transparent text-gray-500 hover:text-gray-700")
                }
              >
                {label}
              </button>
            );
          }),
        )}
      </div>

      <div className="w-full h-[520px] mb-4">
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400 border border-dashed rounded">
            로딩 중...
          </div>
        ) : !option ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-400 border border-dashed rounded">
            {data && data.history.length > 0 && !hasTrades
              ? "매매 내역이 없어 차트를 표시하지 않습니다."
              : "데이터가 없습니다 (사이클이 한 번도 안 돌았거나 아직 백필 전)."}
          </div>
        ) : (
          <ReactECharts
            option={option}
            style={{ width: "100%", height: "100%" }}
            notMerge
            lazyUpdate
            onEvents={{ click: handleChartClick }}
          />
        )}
      </div>

      {data && data.history.length > 0 && hasTrades && (
        <div className="text-xs text-gray-500 flex flex-wrap gap-4">
          <span>총 {data.history.length} 사이클</span>
          <span>
            최근: {formatMoney(data.history[data.history.length - 1].totalValue, currency)}
          </span>
          <span>
            누적 손익:{" "}
            <span
              className={
                data.history[data.history.length - 1].cumulativePnl >= 0
                  ? "text-red-600"
                  : "text-blue-600"
              }
            >
              {formatMoney(data.history[data.history.length - 1].cumulativePnl, currency)}
            </span>
          </span>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-2">
        차트에서 마우스 휠로 확대/축소 · 잡고 드래그로 기간 이동 · 마커에 마우스 올리면 매매 요약 표시
      </p>
    </div>
  );
}
