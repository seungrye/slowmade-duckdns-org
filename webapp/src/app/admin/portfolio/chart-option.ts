/**
 * Assembling the trade chart's options - pure (#378).
 *
 * Lifted out of a useMemo inside the UI component, for two reasons.
 *   1. **Actually rendering and measuring** the legend covering the x-axis dates requires being able to pass the
 *      options alone into a browser (the e2e/chart-legend-overlap harness).
 *   2. The options themselves become unit-testable - with no need to wrap ECharts in a mock.
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

/** The legend entries the UI draws directly in HTML. */
export type LegendItem = {
  name: string;
  color: string;
  dashed?: boolean;
  /** A marker-only series with no line ("other trades"). Its legend mark is a dot rather than a line. */
  markerOnly?: boolean;
};

/** One marker. Clicking it goes to that block's trade detail. */
export type MarkerItem = {
  value: [string, number];
  symbol: string;
  symbolRotate?: number;
  /** Filled (buys only) versus outline only (sells only, or buys and sells) - told apart by shape (#399). */
  fill: boolean;
  /** Which block's detail to go to. An empty string for the account (no owner). */
  portfolioId: string;
  stats: TradeStats;
};

/** The block line's colour. Only colours that do not clash with the account's three lines (blue, green, orange). */
export const BLOCK_COLORS = ["#9333ea", "#0891b2", "#ca8a04", "#db2777", "#4d7c0f"];

export function formatMoney(v: number, currency: Currency): string {
  if (currency === "USD") {
    return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${Math.round(v).toLocaleString()}원`;
}

/** The strategy labels are injected by the UI (this module need not know the strategy list). */
export type BuildArgs = {
  data: PortfolioResponse;
  currency: Currency;
  /** The start date of the initially visible window (30 days on mobile, 90 on desktop). Absent means everything. */
  startValue?: string;
  strategyLabel: (s: string) => string;
};

export function buildChartOption(
  args: BuildArgs,
): { option: EChartsOption; legend: LegendItem[] } | null {
  const { data, currency, startValue, strategyLabel } = args;
  if (!data || data.history.length === 0) return null;
  if (Object.keys(data.tradesByDate ?? {}).length === 0) return null; // hide a market with no trades

  // #133 - **nothing is trimmed.** All the data is passed and dataZoom sets only the initially visible window.
  const history = data.history;
  const dates = history.map((h) => h.dateStr);
  const tradeMeta = data.tradesByDate;
  const blocks = data.blocks ?? [];

  type ESeries = NonNullable<EChartsOption["series"]>;
  const series: ESeries = [];
  const legend: LegendItem[] = [];

  // ── The account's three lines ────────────────────────────────────────
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
    });
    legend.push({ name, color, dashed });
  }

  // ── Assembling the markers ───────────────────────────────────────────
  // The shape says the direction - buys only as a triangle, sells only as an inverted one, both as a square.
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
      // Buys only = a filled triangle / sells only = an outlined inverted triangle / both = an outlined rectangle. (#399)
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

  // A marker series uses **the same name as its line**. ECharts' legend groups by name, so the legend entries do not
  // double, and turning off a line turns off its markers too.
  const pushMarkers = (name: string, items: MarkerItem[], color: string) => {
    if (!items.length) return;
    // Fill and outline differ per item - colour alone is hard to tell apart, so shape makes it clear (#399).
    const data = items.map((it) => ({
      value: it.value,
      symbol: it.symbol,
      ...(it.symbolRotate !== undefined ? { symbolRotate: it.symbolRotate } : {}),
      portfolioId: it.portfolioId,
      stats: it.stats,
      itemStyle: it.fill
        ? { color, borderColor: color, borderWidth: 1, opacity: 0.9 }
        : { color: "transparent", borderColor: color, borderWidth: 1.6, opacity: 1 },
    }));
    series.push({
      type: "scatter",
      name,
      data,
      symbolSize: 9,
      tooltip: { trigger: "item", formatter: markerTooltipFormatter },
    } as never);
  };

  // ── The per-block (strategy) valuation line and its markers ──────────────────
  // It is drawn even with only one block. It may overlap the account's "holdings value", but
  // a strategy line appearing on one market and not another is more confusing (which is what happened on KRX).
  blocks.forEach((b, i) => {
    const color = BLOCK_COLORS[i % BLOCK_COLORS.length];
    const name = `${strategyLabel(b.strategy)} 평가액`;
    const 값 = new Map(b.history.map((h) => [h.dateStr, h.holdingsValue]));
    series.push({
      type: "line",
      name,
      // Aligned to the account curve's x axis. Days before that block existed are left empty.
      data: dates.map((d) => 값.get(d) ?? null),
      connectNulls: false,
      // With only one point no line is drawn - only then is the point itself shown.
      showSymbol: b.history.length < 2,
      symbolSize: 6,
      lineStyle: { color, width: 1.5 },
      itemStyle: { color },
    });
    legend.push({ name, color });
    pushMarkers(name, 마커(b.tradesByDate ?? {}, (d) => 값.get(d) ?? null, b.portfolioId), color);
  });

  // Only the trades attached to no block (records from retired strategies) stay on the account line -
  // otherwise the same trade is marked twice, on the block line and the account line.
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
    // The legend is drawn in HTML by the UI (#378). ECharts' legend sits inside the canvas and covered the x-axis
    // dates - more entries mean more rows while grid.bottom is fixed, so it overlaps structurally.
    // Leaving show:false keeps the model, so legendToggleSelect still works.
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
          // Markers (scatter) avoid appearing twice in the axis tooltip - told apart by type rather than name
          // (because a marker shares its line's name).
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
