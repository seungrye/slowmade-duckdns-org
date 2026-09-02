"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { strategyLabel } from "@/types/trading-marker";
import { useRouter } from "next/navigation";
import { envLabel } from "@/lib/env-label";
import { useDragScrollX } from "@/hooks/use-drag-scroll";
import { useMobile } from "@/hooks/use-mobile";
import { windowStartDate } from "./recent-points";
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
  env: string;
  currency: "KRW" | "USD";
  history: HistoryPoint[];
  /** 블록(전략)별 자산 곡선 (#367·#373). 한 계정·한 시장에 블록이 여럿일 때 구분해 보여준다. */
  blocks?: {
    portfolioId: string; strategy: string; history: HistoryPoint[];
    tradesByDate?: Record<string, TradeStats>;
  }[];
  tradesByDate: Record<string, TradeStats>;
  /** 어느 블록에도 안 붙은 매매만 (#373). 블록 마커를 쓸 때 계좌 선엔 이것만 남긴다. */
  unownedTradesByDate?: Record<string, TradeStats>;
};

type Env = string;
type Currency = "KRW" | "USD";

function formatMoney(v: number, currency: Currency): string {
  if (currency === "USD") {
    return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${Math.round(v).toLocaleString()}원`;
}

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

  const option = useMemo<EChartsOption | null>(() => {
    if (!data || data.history.length === 0) return null;
    if (Object.keys(data.tradesByDate ?? {}).length === 0) return null; // 매매 없는 시장 숨김

    // #133 — **자르지 않는다.** 데이터는 전부 넘기고 아래 dataZoom 으로 처음 보이는 창만
    //   최근 구간(모바일 30 일 · 데스크톱 90 일)으로 잡는다. 그래야 밀어서 이전 기간을 볼 수
    //   있다. 마커·툴팁도 같은 배열을 보므로 확대하면 함께 따라온다.
    const history = data.history;

    const dates = history.map((h) => h.dateStr);
    const totalData = history.map((h) => h.totalValue);
    const cashData = history.map((h) => h.cash);
    const holdingsData = history.map((h) => h.holdingsValue);

    // 매매 마커. 모양이 방향을 말한다 — 매수만 ▲ / 매도만 ▼ / 둘 다 ■.
    // 블록이 여럿이면 **그 블록 선 위에** 블록색으로 찍는다 (#373) — 그래야 어느 전략이
    // 샀는지 한눈에 보이고, 눌렀을 때 그 블록의 매매 상세로 갈 수 있다.
    type ESeries = NonNullable<EChartsOption["series"]>;
    const tradeMeta: Record<string, TradeStats> = data.tradesByDate;

    type MarkerItem = {
      value: [string, number];
      symbol: string;
      symbolRotate?: number;
      /** 클릭 시 어느 블록의 상세로 갈지. 계좌(주인 없음)면 빈 문자열. */
      portfolioId: string;
      stats: TradeStats;
    };
    const 마커 = (
      stats: Record<string, TradeStats>,
      값: (dateStr: string) => number | null,
      portfolioId: string,
    ): MarkerItem[] => {
      const out: MarkerItem[] = [];
      for (const h of history) {
        const st = stats[h.dateStr];
        if (!st || (st.buy === 0 && st.sell === 0)) continue;
        const y = 값(h.dateStr);
        if (y === null || !Number.isFinite(y)) continue;
        const 둘다 = st.buy > 0 && st.sell > 0;
        out.push({
          value: [h.dateStr, y],
          symbol: 둘다 ? "rect" : "triangle",
          ...(!둘다 && st.sell > 0 ? { symbolRotate: 180 } : {}),
          portfolioId,
          stats: st,
        });
      }
      return out;
    };

    const markerTooltipFormatter = (
      p: { value: [string, number]; data?: { stats?: TradeStats } },
    ) => {
      const d = p.value[0];
      const stats = p.data?.stats ?? tradeMeta[d];
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
      const tv = history.find((h) => h.dateStr === d);
      if (tv) {
        lines.push(`총자산 ${formatMoney(tv.totalValue, currency)}`);
      }
      return lines.join("<br/>");
    };

    const 블록색 = ["#9333ea", "#0891b2", "#ca8a04", "#db2777", "#4d7c0f"];
    const blocks = data.blocks ?? [];
    // 블록 선은 **보유 평가액**이다 (#373). 계좌 「보유 평가액」선의 분해라 블록 선들의 합이
    // 계좌선과 겹쳐 눈으로 검증된다. 총액(장부현금+평가액)으로 그리려 해도 블록 장부 현금은
    // 과거값이 DB 에 없어 곡선이 안 된다 — 없는 것을 지어내지 않는다.
    const blockLines = blocks.map((b, i) => {
      const 값 = new Map(b.history.map((h) => [h.dateStr, h.holdingsValue]));
      return {
        type: "line" as const,
        name: `${strategyLabel(b.strategy)} 평가액`,
        // 계좌 곡선과 x 축을 맞춘다. 그 블록이 아직 없던 날은 빈 값으로 둔다.
        data: dates.map((d) => 값.get(d) ?? null),
        connectNulls: false,
        // 점이 하나뿐이면 선이 안 그려진다 — 그때만 점을 보인다.
        showSymbol: b.history.length < 2,
        symbolSize: 6,
        lineStyle: { color: 블록색[i % 블록색.length], width: 1.5 },
        itemStyle: { color: 블록색[i % 블록색.length] },
      };
    });
    const 블록선표시 = blockLines.length > 1;

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
      // 블록(전략)별 평가액 선 (#367·#373). 계좌 선과 **함께** 그린다 — 합이 계좌
      // 「보유 평가액」과 맞는지 나란히 놓여야 보인다.
      // 블록이 하나뿐이면 계좌 선과 겹치므로 그리지 않는다.
      ...(블록선표시 ? blockLines : []),
    ];


    // ── 마커 시리즈 ─────────────────────────────────────────────
    // 블록이 여럿이면 블록 선 위에 블록색으로. 어느 블록에도 안 붙은 매매(폐기된 전략의
    // 기록)만 계좌 선에 남긴다 — 안 그러면 같은 매매가 두 번 찍힌다.
    const 마커시리즈이름 = new Set<string>();
    const pushMarkers = (name: string, items: MarkerItem[], color: string) => {
      if (!items.length) return;
      마커시리즈이름.add(name);
      series.push({
        type: "scatter",
        name,
        data: items,
        symbolSize: 11,
        itemStyle: { color, borderColor: color },
        tooltip: { trigger: "item", formatter: markerTooltipFormatter },
      } as never);
    };

    if (블록선표시) {
      blocks.forEach((b, i) => {
        const 값 = new Map(b.history.map((h) => [h.dateStr, h.holdingsValue]));
        pushMarkers(
          `${strategyLabel(b.strategy)} 매매`,
          마커(b.tradesByDate ?? {}, (d) => 값.get(d) ?? null, b.portfolioId),
          블록색[i % 블록색.length],
        );
      });
      const 계좌값 = new Map(history.map((h) => [h.dateStr, h.totalValue]));
      pushMarkers(
        "기타 매매",
        마커(data.unownedTradesByDate ?? {}, (d) => 계좌값.get(d) ?? null, ""),
        "#64748b",
      );
    } else {
      // 블록이 하나뿐(또는 없음)이면 종전대로 계좌 선 위에 방향별로 나눠 찍는다.
      const 계좌값 = new Map(history.map((h) => [h.dateStr, h.totalValue]));
      const all = 마커(tradeMeta, (d) => 계좌값.get(d) ?? null, "");
      pushMarkers("▲ 매수만", all.filter((m) => m.stats.buy > 0 && m.stats.sell === 0), "#dc2626");
      pushMarkers("▼ 매도만", all.filter((m) => m.stats.sell > 0 && m.stats.buy === 0), "#2563eb");
      pushMarkers("■ 매수+매도", all.filter((m) => m.stats.buy > 0 && m.stats.sell > 0), "#9333ea");
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
            // scatter(매매 마커) series 는 axis tooltip 에서 중복 노출 회피
            const n = p.seriesName ?? "";
            if (마커시리즈이름.has(n)) continue;
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
        // startValue 로 처음 보이는 구간만 잡는다. 데이터는 그대로라 밀면 이전 기간이 나온다.
        // 잡을 것이 없으면(데이터가 이미 그 안이면) undefined 라 전체가 보인다.
        {
          type: "inside",
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
          startValue: windowStartDate(dates, isMobile),
        },
      ],
      series,
    };
  }, [data, currency, isMobile]);

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
        <br />
        마커 모양: ▲ 매수만 · ▼ 매도만 · ■ 매수+매도. 마커를 누르면 그 날(전략별) 매매 상세로 갑니다.
      </p>
    </div>
  );
}
