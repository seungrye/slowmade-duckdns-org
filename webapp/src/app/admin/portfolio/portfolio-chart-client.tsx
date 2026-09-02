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
  // 탭 조합 — tabs(숨김 아닌 기록이 실존하는 (env,currency)) 우선. 없으면 envs × [KRW,USD] 폴백(하위호환).
  const combos = tabs && tabs.length
    ? tabs
    : envs.flatMap((e) => (["KRW", "USD"] as const).map((c) => ({ env: e, currency: c })));
  const router = useRouter();
  const [env, setEnv] = useState<Env>(initialData?.env ?? combos[0]?.env ?? "paper");
  const tabScroll = useDragScrollX<HTMLDivElement>();
  // #95/#97 — 차트는 최근 구간만 그린다(모바일 30 일 · 데스크톱 90 일).
  //   요약 수치는 전체 기준을 유지한다.
  const isMobile = useMobile();
  const [currency, setCurrency] = useState<Currency>(initialData?.currency ?? combos[0]?.currency ?? "KRW");
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
  // 범례를 HTML 로 그린다 (#378). ECharts 범례는 캔버스 안에 얹혀 항목이 늘면 줄이 늘고,
  // grid.bottom 은 고정이라 x 축 날짜를 덮었다(모바일에서 실제로 겹쳤다).
  // 여기서는 일반 흐름에 놓이므로 구조적으로 겹칠 수 없다.
  const chartRef = useRef<{ getEchartsInstance: () => { dispatchAction: (p: unknown) => void } } | null>(null);
  const [off, setOff] = useState<Record<string, boolean>>({});
  // 탭을 바꾸면 계열 이름이 달라지므로 토글 상태를 비운다.
  useEffect(() => setOff({}), [env, currency]);
  const toggleLegend = (name: string) => {
    chartRef.current?.getEchartsInstance().dispatchAction({ type: "legendToggleSelect", name });
    setOff((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  // 차트 클릭 → 그 날 매매 종목 list 가 있으면 종목 차트로 이동.
  // currency 에 따라 market (KR/US) 자동 분기. center 쿼리로 그 날짜 중앙 표시.
  const handleChartClick = (params: { name?: string; value?: unknown; data?: unknown }) => {
    if (!data) return;
    // params.name 은 category axis 라벨 (dateStr) — line series click 시 사용.
    // scatter series 는 data 가 { value: [date, y], portfolioId } 객체다 (#373).
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
    // 매매 상세 페이지로 이동. 블록 마커를 눌렀으면 그 블록만 보여준다 (#374).
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
        마커 모양: ▲ 매수만 · ▼ 매도만 · ■ 매수+매도. 마커를 누르면 그 날(전략별) 매매 상세로 갑니다.
      </p>
    </div>
  );
}
