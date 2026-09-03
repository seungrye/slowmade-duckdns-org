/**
 * 매매 차트 옵션 조립 — 순수 (#378).
 *
 * 화면 컴포넌트 안 useMemo 에 있던 것을 떼어냈다. 두 가지 때문이다.
 *   1. 범례가 x 축 날짜를 덮는 문제를 **실제로 렌더해 좌표로 재려면** 옵션만 따로
 *      브라우저에 넘길 수 있어야 한다(e2e/chart-legend-overlap 하네스).
 *   2. 옵션 자체를 단위 테스트할 수 있다 — ECharts 를 목으로 감싸지 않아도 된다.
 */
import type { EChartsOption } from "echarts";

export type Currency = "KRW" | "USD";

export type HistoryPoint = {
  dateStr: string;
  totalValue: number;
  cash: number;
  holdingsValue: number;
  cumulativePnl: number;
  backfilled?: boolean;
};

export type TradeStats = {
  buy: number;
  sell: number;
  buyAmount: number;
  sellAmount: number;
  buyTickers: string[];
  sellTickers: string[];
};

export type BlockSeries = {
  portfolioId: string;
  strategy: string;
  history: HistoryPoint[];
  tradesByDate?: Record<string, TradeStats>;
};

export type PortfolioResponse = {
  env: string;
  currency: Currency;
  history: HistoryPoint[];
  blocks?: BlockSeries[];
  tradesByDate: Record<string, TradeStats>;
  unownedTradesByDate?: Record<string, TradeStats>;
};

/** 화면이 HTML 로 직접 그리는 범례 항목. */
export type LegendItem = {
  name: string;
  color: string;
  dashed?: boolean;
  /** 선이 없는 마커 전용 계열(「기타 매매」). 범례 표식을 선이 아니라 점으로 낸다. */
  markerOnly?: boolean;
};

/** 마커 하나. 클릭하면 그 블록의 매매 상세로 간다. */
export type MarkerItem = {
  value: [string, number];
  symbol: string;
  symbolRotate?: number;
  /** 채움(매수만) vs 테두리만(매도만·매수+매도) — 형태로 구분 (#399). */
  fill: boolean;
  /** 어느 블록의 상세로 갈지. 계좌(주인 없음)면 빈 문자열. */
  portfolioId: string;
  stats: TradeStats;
};

/** 블록 선 색. 계좌 3선(파랑·초록·주황)과 겹치지 않는 색만 쓴다. */
export const BLOCK_COLORS = ["#9333ea", "#0891b2", "#ca8a04", "#db2777", "#4d7c0f"];

export function formatMoney(v: number, currency: Currency): string {
  if (currency === "USD") {
    return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${Math.round(v).toLocaleString()}원`;
}

/** 전략 라벨은 화면에서 주입한다(이 모듈이 전략 목록을 알 필요는 없다). */
export type BuildArgs = {
  data: PortfolioResponse;
  currency: Currency;
  /** 처음 보이는 창의 시작 날짜(모바일 30 일·데스크톱 90 일). 없으면 전체. */
  startValue?: string;
  strategyLabel: (s: string) => string;
};

export function buildChartOption(
  args: BuildArgs,
): { option: EChartsOption; legend: LegendItem[] } | null {
  const { data, currency, startValue, strategyLabel } = args;
  if (!data || data.history.length === 0) return null;
  if (Object.keys(data.tradesByDate ?? {}).length === 0) return null; // 매매 없는 시장 숨김

  // #133 — **자르지 않는다.** 데이터는 전부 넘기고 dataZoom 으로 처음 보이는 창만 잡는다.
  const history = data.history;
  const dates = history.map((h) => h.dateStr);
  const tradeMeta = data.tradesByDate;
  const blocks = data.blocks ?? [];

  type ESeries = NonNullable<EChartsOption["series"]>;
  const series: ESeries = [];
  const legend: LegendItem[] = [];

  // ── 계좌 3선 ────────────────────────────────────────────────
  const 계좌선: [string, string, keyof HistoryPoint, boolean][] = [
    ["추정 총 재산", "#2563eb", "totalValue", false],
    ["추정 잔여 현금", "#16a34a", "cash", true],
    ["보유 평가액", "#ea580c", "holdingsValue", true],
  ];
  for (const [name, color, key, dashed] of 계좌선) {
    series.push({
      type: "line",
      name,
      data: history.map((h) => h[key] as number),
      showSymbol: false,
      smooth: false,
      lineStyle: { color, width: dashed ? 1.5 : 2, ...(dashed ? { type: "dashed" as const } : {}) },
      itemStyle: { color },
      z: 2,
    });
    legend.push({ name, color, dashed });
  }

  // ── 마커 조립 ───────────────────────────────────────────────
  // 모양이 방향을 말한다 — 매수만 ▲ / 매도만 ▼ / 둘 다 ■.
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
      // 매수만 = 채운 ▲ / 매도만 = 테두리만 ▽ / 매수+매도 = 테두리만 ▭. (#399)
      const 둘다 = st.buy > 0 && st.sell > 0;
      const 매도만 = !둘다 && st.sell > 0;
      out.push({
        value: [h.dateStr, y],
        symbol: 둘다 ? "rect" : "triangle",
        ...(매도만 ? { symbolRotate: 180 } : {}),
        fill: !둘다 && !매도만, // 매수만일 때만 채운다
        portfolioId,
        stats: st,
      });
    }
    return out;
  };

  const markerTooltipFormatter = (p: { value: [string, number]; data?: { stats?: TradeStats } }) => {
    const d = p.value[0];
    const stats = p.data?.stats ?? tradeMeta[d];
    if (!stats) return `${d}<br/>매매 없음`;
    const lines = [`<b>${d}</b>`];
    if (stats.buy > 0) lines.push(`▲ 매수 ${stats.buy}건 · ${formatMoney(stats.buyAmount, currency)}`);
    if (stats.sell > 0) lines.push(`▼ 매도 ${stats.sell}건 · ${formatMoney(stats.sellAmount, currency)}`);
    const tv = history.find((h) => h.dateStr === d);
    if (tv) lines.push(`총자산 ${formatMoney(tv.totalValue, currency)}`);
    return lines.join("<br/>");
  };

  // 마커 series 는 **그 선과 같은 이름**을 쓴다. ECharts 범례는 이름으로 묶이므로
  // 범례 항목이 두 배로 늘지 않고, 선을 끄면 마커도 함께 꺼진다.
  const pushMarkers = (name: string, items: MarkerItem[], color: string) => {
    if (!items.length) return;
    // 항목마다 채움/테두리를 다르게 — 색만으로 구분이 어려워 형태로 명확히 (#399).
    const data = items.map((it) => ({
      value: it.value,
      symbol: it.symbol,
      ...(it.symbolRotate !== undefined ? { symbolRotate: it.symbolRotate } : {}),
      portfolioId: it.portfolioId,
      stats: it.stats,
      itemStyle: it.fill
        ? { color, borderColor: color, borderWidth: 1, opacity: 0.9 }
        // 테두리만(속 투명). z=10 으로 마커가 선 위에 칠해지므로 예전처럼 선이 테두리를
        // 관통하지 않는다 (#403). 흰 채움은 너무 튀어 투명으로 둔다.
        : { color: "transparent", borderColor: color, borderWidth: 1.6, opacity: 1 },
    }));
    series.push({
      type: "scatter",
      name,
      data,
      symbolSize: 9,
      // 마커는 선 위에 (#403). ECharts 는 선(line)을 scatter 위에 그리는 경향이 있어(배열
      // 순서만으론 안 됨 — 실측으로 선이 마커를 관통했다), z 로 명시해 마커를 올린다.
      // 그리는 짝(블록 선→그 마커)은 그대로, 칠하는 층위만 마커를 위로.
      z: 10,
      tooltip: { trigger: "item", formatter: markerTooltipFormatter },
    } as never);
  };

  // ── 블록(전략)별 평가액 선 + 그 위의 마커 ──────────────────
  // 블록이 하나뿐이어도 그린다. 계좌 「보유 평가액」과 겹쳐 보일 수는 있어도,
  // 전략 선이 시장마다 있다 없다 하면 그게 더 헷갈린다(국장에서 실제로 그랬다).
  blocks.forEach((b, i) => {
    const color = BLOCK_COLORS[i % BLOCK_COLORS.length];
    const name = `${strategyLabel(b.strategy)} 평가액`;
    const 값 = new Map(b.history.map((h) => [h.dateStr, h.holdingsValue]));
    series.push({
      type: "line",
      name,
      // 계좌 곡선과 x 축을 맞춘다. 그 블록이 아직 없던 날은 빈 값으로 둔다.
      data: dates.map((d) => 값.get(d) ?? null),
      connectNulls: false,
      // 점이 하나뿐이면 선이 안 그려진다 — 그때만 점을 보인다.
      showSymbol: b.history.length < 2,
      symbolSize: 6,
      lineStyle: { color, width: 1.5 },
      itemStyle: { color },
      z: 2,
    });
    legend.push({ name, color });
    pushMarkers(name, 마커(b.tradesByDate ?? {}, (d) => 값.get(d) ?? null, b.portfolioId), color);
  });

  // 어느 블록에도 안 붙은 매매(폐기된 전략의 기록)만 계좌 선에 남긴다 —
  // 안 그러면 같은 매매가 블록 선과 계좌 선에 두 번 찍힌다.
  const 계좌값 = new Map(history.map((h) => [h.dateStr, h.totalValue]));
  const 기타 = blocks.length
    ? 마커(data.unownedTradesByDate ?? {}, (d) => 계좌값.get(d) ?? null, "")
    : 마커(tradeMeta, (d) => 계좌값.get(d) ?? null, "");
  if (기타.length) {
    const name = blocks.length ? "기타 매매" : "매매";
    pushMarkers(name, 기타, "#64748b");
    legend.push({ name, color: "#64748b", markerOnly: true });
  }

  const option: EChartsOption = {
    animation: false,
    // 범례는 화면이 HTML 로 그린다 (#378). ECharts 범례는 캔버스 안에 얹혀 x 축 날짜를
    // 덮었다 — 항목이 늘면 줄이 늘어나는데 grid.bottom 은 고정이라 구조적으로 겹친다.
    // show:false 로 두면 모델은 남아 legendToggleSelect 가 그대로 동작한다.
    legend: { show: false },
    grid: { left: 24, right: 16, top: 16, bottom: 28 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      formatter: ((
        params: Array<{
          axisValue?: string; seriesName?: string; seriesType?: string;
          value?: number | [string, number]; color?: string;
        }>,
      ) => {
        if (!Array.isArray(params) || params.length === 0) return "";
        const date = String(params[0].axisValue ?? "");
        const lines = [`<b>${date}</b>`];
        for (const p of params) {
          // 마커(scatter)는 축 툴팁에서 중복 노출 회피 — 이름이 아니라 종류로 가른다
          // (마커가 선과 같은 이름을 쓰기 때문).
          if (p.seriesType === "scatter") continue;
          const raw = p.value;
          const v = Array.isArray(raw) ? Number(raw[1]) : Number(raw);
          if (!Number.isFinite(v)) continue;
          lines.push(
            `<span style="display:inline-block;width:8px;height:8px;background:${p.color};border-radius:50%;margin-right:4px;"></span>${p.seriesName ?? ""}: ${formatMoney(v, currency)}`,
          );
        }
        const stats = tradeMeta[date];
        if (stats) {
          if (stats.buy > 0) {
            lines.push(`<span style="color:#dc2626">▲ 매수 ${stats.buy}건 · ${formatMoney(stats.buyAmount, currency)}</span>`);
          }
          if (stats.sell > 0) {
            lines.push(`<span style="color:#2563eb">▼ 매도 ${stats.sell}건 · ${formatMoney(stats.sellAmount, currency)}</span>`);
          }
          if (stats.buy > 0 || stats.sell > 0) {
            lines.push(`<span style="color:#9333ea;font-size:11px">(클릭 → 매매 상세)</span>`);
          }
        }
        return lines.join("<br/>");
      }) as never,
    },
    xAxis: { type: "category", data: dates, axisLabel: { fontSize: 11 } },
    yAxis: { type: "value", scale: true, axisLabel: { show: false } },
    dataZoom: [
      { type: "inside", zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: false, startValue },
    ],
    series,
  };
  return { option, legend };
}
