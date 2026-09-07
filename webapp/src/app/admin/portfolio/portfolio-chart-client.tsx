"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { strategyLabel } from "@/types/trading-marker";
import { formatMoney, type PortfolioResponse } from "./chart-option";
import { useRouter } from "next/navigation";
import { envLabel } from "@/lib/env-label";
import { useDragScrollX } from "@/hooks/use-drag-scroll";
import { useMobile } from "@/hooks/use-mobile";
import { windowStartDate } from "./recent-points";
import { buildChartOption } from "./chart-option";
import ReactECharts from "echarts-for-react";

type Env = string;
type Currency = "KRW" | "USD";

export default function PortfolioChartClient({ initialData, envs = ["paper", "real"], tabs }:
  { initialData?: PortfolioResponse; envs?: string[]; tabs?: { env: string; currency: Currency }[] }) {
  // The tab combinations - tabs (the (env, currency) pairs with unhidden records) win. Without them it falls back to envs x [KRW, USD] (for compatibility).
  const combos = tabs && tabs.length
    ? tabs
    : envs.flatMap((e) => (["KRW", "USD"] as const).map((c) => ({ env: e, currency: c })));
  const router = useRouter();
  const [env, setEnv] = useState<Env>(initialData?.env ?? combos[0]?.env ?? "paper");
  const tabScroll = useDragScrollX<HTMLDivElement>();
  // #95/#97 - the chart draws only the recent range (30 days on mobile, 90 on desktop).
  //   The summary figures stay based on everything.
  const isMobile = useMobile();
  const [currency, setCurrency] = useState<Currency>(initialData?.currency ?? combos[0]?.currency ?? "KRW");
  const [data, setData] = useState<PortfolioResponse | null>(initialData ?? null);
  const [loading, setLoading] = useState(false);
  // With the default (paper, KRW) data injected by SSR (page.tsx), the first fetch is skipped. Later tab changes fetch.
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

  // Whether that (env, currency) has even one trade. A market with no trades has its lines hidden
  // (portfolio snapshots accumulate daily regardless of trading, so with 0 trades the chart is meaningless).
  const hasTrades = !!data && Object.keys(data.tradesByDate ?? {}).length > 0;

  const built = useMemo(
    () =>
      data
        ? buildChartOption({
            data,
            currency,
            startValue: windowStartDate(data.history.map((h) => h.dateStr), isMobile),
            strategyLabel,
          })
        : null,
    [data, currency, isMobile],
  );
  const option = built?.option ?? null;
  const legendItems = built?.legend ?? [];
  // The legend is drawn in HTML (#378). ECharts' legend sits inside the canvas, and more entries mean more rows while
  // grid.bottom is fixed, so it covered the x-axis dates (it really overlapped on mobile).
  // Here it sits in normal flow, so it cannot overlap structurally.
  const chartRef = useRef<{ getEchartsInstance: () => { dispatchAction: (p: unknown) => void } } | null>(null);
  const [off, setOff] = useState<Record<string, boolean>>({});
  // Changing tabs changes the series names, so the toggle state is cleared.
  useEffect(() => setOff({}), [env, currency]);
  const toggleLegend = (name: string) => {
    chartRef.current?.getEchartsInstance().dispatchAction({ type: "legendToggleSelect", name });
    setOff((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  // A chart click -> if there is a list of symbols traded that day, it goes to the symbol chart.
  // The market (KR/US) branches automatically on the currency. The center query centres that date.
  const handleChartClick = (params: { name?: string; value?: unknown; data?: unknown }) => {
    if (!data) return;
    // params.name is the category axis label (dateStr) - used when a line series is clicked.
    // A scatter series' data is a { value: [date, y], portfolioId } object (#373).
    const item = params.data as { value?: unknown; portfolioId?: string } | undefined;
    let date: string | null = null;
    if (Array.isArray(item?.value) && typeof item.value[0] === "string") date = item.value[0];
    else if (typeof params.name === "string" && params.name) date = params.name;
    else if (Array.isArray(params.value) && typeof params.value[0] === "string") date = params.value[0];
    else if (Array.isArray(params.data) && typeof params.data[0] === "string") date = params.data[0] as string;
    if (!date) return;
    const stats = data.tradesByDate[date];
    if (!stats) return;
    const tickers = Array.from(new Set([...stats.buyTickers, ...stats.sellTickers]));
    if (tickers.length === 0) return;
    // Goes to the trade detail page. Clicking a block marker shows that block alone (#374).
    const q = new URLSearchParams({ env, currency, center: date });
    if (item?.portfolioId) q.set("portfolioId", item.portfolioId);
    router.push(`/admin/portfolio/detail?${q.toString()}`);
  };

  return (
    <div>
      {/* env × currency 탭 */}
      <div {...tabScroll} className="flex flex-nowrap gap-2 border-b mb-4 overflow-x-auto overflow-y-hidden scrollbar-hide">
        {combos.map(({ env: e, currency: c }) => {
            const active = env === e && currency === c;
            const label = `${envLabel(e)} · ${c === "KRW" ? "국장" : "미장"}`;
            return (
              <button
                key={`${e}-${c}`}
                type="button"
                onClick={() => {
                  setEnv(e);
                  setCurrency(c);
                }}
                className={
                  "px-3 py-2 text-sm border-b-2 -mb-px transition whitespace-nowrap shrink-0 " +
                  (active
                    ? "border-blue-600 text-blue-600 font-medium"
                    : "border-transparent text-gray-500 hover:text-gray-700")
                }
              >
                {label}
              </button>
            );
          })}
      </div>

      <div className="w-full aspect-[4/3] sm:aspect-auto sm:h-[520px] mb-4">
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
            ref={chartRef as never}
            option={option}
            style={{ width: "100%", height: "100%" }}
            notMerge
            lazyUpdate
            onEvents={{ click: handleChartClick }}
          />
        )}
      </div>

      {legendItems.length > 0 && option && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3 text-xs" aria-label="차트 범례">
          {legendItems.map((it) => (
            <li key={it.name}>
              <button
                type="button"
                onClick={() => toggleLegend(it.name)}
                aria-pressed={!off[it.name]}
                className={`flex items-center gap-1.5 transition ${off[it.name] ? "opacity-40" : ""}`}
              >
                {/* 마커 전용 계열은 선이 아니라 점이다 — 표식이 실물과 달라 보이면 안 된다. */}
                <span
                  className={`inline-block shrink-0 ${it.markerOnly ? "w-2 h-2 rounded-full" : "w-4 rounded-sm"}`}
                  style={{
                    ...(it.markerOnly ? {} : { height: 3 }),
                    backgroundColor: off[it.name] ? "#9ca3af" : it.color,
                  }}
                />
                <span className="whitespace-nowrap">{it.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

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
        <br />
        마커: ▲(채움) 매수 · ▽(테두리) 매도 · ▭(테두리) 매수+매도. 누르면 그 날(전략별) 매매 상세로 갑니다.
      </p>
    </div>
  );
}
