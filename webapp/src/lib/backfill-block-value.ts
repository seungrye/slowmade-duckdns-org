/**
 * Reconstructs a block's past holdings value from the trade records - pure (#373).
 *
 * Block rows accumulate one point a day from #369 onward, leaving everything before that permanently blank. A line
 * with a single point draws nothing, so the chart shows only a legend entry.
 *
 * What can be reconstructed is **the holdings value alone**. The block's ledger cash (v4 `cycleCash`, VR `pool`) has
 * no past values in the DB - what is unknown is not invented.
 *
 * Every value is measured: quantity is the running total of the fills attributed to that block (#372), and the price
 * is the close from `stockdailyprices`. A day with no close **carries the previous one forward** - leaving 0 would
 * carve a false valley where the assets look to have vanished for a day.
 */
export type BackfillTrade = {
  ticker: string;
  date: string; // YYYY-MM-DD
  action: "buy" | "sell";
  qty: number;
  /** A price seed (the fill price) for the early stretch where no close exists yet. */
  price?: number;
};

export type BackfillPoint = { date: string; holdingsValue: number; qty: number };

export function blockValueSeries(args: {
  trades: BackfillTrade[];
  /** ticker -> (date -> close) */
  closes: Map<string, Map<string, number>>;
  /** The date axis to plot (ascending). Usually the union of those symbols' bar dates. */
  dates: string[];
}): BackfillPoint[] {
  const { trades, closes, dates } = args;
  if (!trades.length || !dates.length) return [];

  const 시작 = trades.reduce((m, t) => (t.date < m ? t.date : m), trades[0].date);
  const 날짜별매매 = new Map<string, BackfillTrade[]>();
  for (const t of trades) {
    (날짜별매매.get(t.date) ?? 날짜별매매.set(t.date, []).get(t.date)!).push(t);
  }

  const 보유 = new Map<string, number>();
  const 마지막가 = new Map<string, number>();
  const out: BackfillPoint[] = [];

  for (const d of dates) {
    if (d < 시작) continue;
    for (const t of 날짜별매매.get(d) ?? []) {
      const cur = 보유.get(t.ticker) ?? 0;
      보유.set(t.ticker, Math.max(0, t.action === "buy" ? cur + t.qty : cur - t.qty));
      // The early stretch with no close yet starts from the fill price (both are measured values).
      if (t.price && t.price > 0 && !마지막가.has(t.ticker)) 마지막가.set(t.ticker, t.price);
    }
    let value = 0;
    let qtySum = 0;
    for (const [ticker, qty] of 보유) {
      if (qty <= 0) continue;
      const close = closes.get(ticker)?.get(d);
      if (close && close > 0) 마지막가.set(ticker, close);
      const px = 마지막가.get(ticker);
      if (!px) continue; // A symbol whose price was never seen is left out of the value (not counted as 0)
      value += qty * px;
      qtySum += qty;
    }
    out.push({ date: d, holdingsValue: value, qty: qtySum });
  }
  return out;
}
