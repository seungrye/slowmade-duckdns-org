// Infinite-buying backtest types - a browser (TypeScript) port of stock-automator-v2's
// strategy/base.py and backtest/engine.py. The strategy logic is kept identical to the original.

export type Side = "buy" | "sell";
export type OrdType = "market" | "limit" | "loc";

/** One daily bar (OHLC). */
export interface Bar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number; // volume - used only by rotation's candidate auto-selection (the traded-value ranking); absent counts as 0
}

/** Infinite-buying settings (the backtest-tunable parameters of the original StrategyConfig). */
export interface InfiniteConfig {
  principal: number; // the allocated principal
  splits: number; // split count T (40 by default) - the daily buy amount is principal / splits
  takeProfitPct: number; // the sell target over the average price (0.10 by default)
  locPremiumPct: number; // the LOC buy premium over the current price (0.12 by default)
}

/** The market snapshot a strategy sees (the part of the original MarketState infinite buying uses). */
export interface MarketState {
  price: number;
  holdingQty: number;
  avgPrice: number;
  roundNo: number;
}

export interface Signal {
  side: Side;
  qty: number;
  price: number;
  ordType: OrdType;
  reason: string;
}

export interface BtTrade {
  date: string;
  side: Side;
  price: number;
  qty: number;
  pnl: number; // 0 on a buy, the realized P&L on a sell
  roundNo: number; // the round at the fill (after the fill on a buy, just before the cycle reset on a sell)
  ticker?: string; // which symbol filled, for multi-symbol strategies (rotation)
}

export interface EquityPoint {
  date: string;
  equity: number; // holdings value (the same as the original equity_curve: quantity x close)
}

export interface BacktestResult {
  trades: BtTrade[];
  equityCurve: EquityPoint[];
  /**
   * The meaning depends on the strategy - the UI labels it accordingly (#345).
   *   infinite buying, rotation, dual momentum  the sum of realized P&L on sells
   *   VR, volatility targeting                  final assets - capital invested (**unrealized P&L included**)
   * A strategy that keeps holding cannot show its real performance from realized P&L alone, so it uses total P&L.
   */
  totalPnl: number;
  resolvedV?: number; // infinite buying v4: the V (volatility coefficient) actually used for scoring, either given by the user or derived.
  poolLog?: string[]; // the history of rotation candidate pool changes (auto-selection mode only)
  /**
   * VR: the day's target path, band and stock valuation (#341). The chart draws "why it bought or sold that day".
   *
   * Why `stock` is separate: the band wraps the **stock valuation** (qty x close), not
   * `equityCurve.equity` (= stock + Pool cash). Overlaying the band on total assets floats it above by the Pool,
   * so it looks "always outside the band".
   */
  vrBand?: { date: string; v: number; low: number; high: number; stock: number }[];
  /**
   * VR's effective average price = (cumulative buys - cumulative sells) / quantity held (source 4.2). null when nothing is held.
   *
   * The nominal average (what the broker screen shows) does not move on a sell, but this one does - profitable sells
   * pull it down, and once it goes **negative** it means the sales brought in more than the buys cost
   * (source 4.3, the "zero principal" state).
   */
  effectiveAvg?: number | null;
  // Accumulating (periodic deposits) - filled only when contribution is given. For the metrics (TWR) and the total-paid display.
  contributions?: { date: string; amount: number }[]; // the dates and amounts actually deposited
  totalContributed?: number; // initial principal + total deposits (for reference, so the return's denominator is not distorted)
}

/** Trend-following settings (the backtest-tunable parameters of the original TrendConfig). */
export interface TrendConfig {
  principal: number; // buy this much at market on entry
  shortMa: number; // the short moving average (20 by default)
  longMa: number; // the long moving average (60 by default)
}

/** The state a trend-following strategy sees - history is closes newest first (today = history[0]).
 *  peak is the highest close while held (tracked by the engine, 0 when flat), for v4's trailing stop. */
export interface TrendState {
  price: number;
  holdingQty: number;
  avgPrice: number;
  history: number[];
  peak?: number;
}

/** v2 - a price/moving-average breakout. Buy when the close breaks above the MA, liquidate when it falls below. */
export interface TrendV2Config {
  principal: number;
  maPeriod: number; // the reference moving average (20 by default)
}

/** v3 - a golden cross with a trend (slope) filter. Enter only while the long MA is rising. */
export interface TrendV3Config {
  principal: number;
  shortMa: number;
  longMa: number;
  slopeDays: number; // the long MA is rising when today's long MA > that of slopeDays ago (5 by default)
}

/** v4 - a trailing stop. Enter on a golden cross, exit on a dead cross or -trailPct from the high while held. */
export interface TrendV4Config {
  principal: number;
  shortMa: number;
  longMa: number;
  trailPct: number; // the fall from the high that liquidates (0.30 = 30% by default)
}

/** Regime momentum v1 - a 200-day regime filter (with a band) plus absolute-momentum entry, exiting on a regime break or trailing stop.
 *  Faber's long-MA timing combined with Antonacci's absolute momentum (cash in a down market, held in an up one). */
export interface RegimeV1Config {
  principal: number;
  smaPeriod: number; // the long SMA the regime is judged against (200 by default)
  bandPct: number; // the SMA band (hysteresis) ratio (0.02 = +/-2% by default) - stops churning around the line
  momDays: number; // the absolute-momentum confirmation window: close >= the close momDays ago (60 by default)
  trailPct: number; // liquidate on this fall from the high while held (0.25 by default)
}

/** Momentum rotation v1 - dual momentum (Antonacci) crossed with the LRS regime filter. Holds only the candidate
 *  ETF with the best return over the last momDays (relative momentum), and goes fully to cash when the index breaks
 *  below SMA - band (absolute / regime). Symbol selection is built into the strategy - the leader is re-evaluated
 *  every rebalanceDays and switched automatically. */
export interface RotationV1Config {
  principal: number;
  smaPeriod: number; // the signal's (1x index) SMA (200 by default)
  bandPct: number; // the regime band hysteresis (0.01 by default)
  momDays: number; // the relative-momentum lookback in trading days (126 by default, about 6 months)
  momLookbacks?: number[]; // composite momentum: the average of several lookbacks ([21,63,126,252], say). Unset means the single momDays.
  rebalanceDays: number; // how often the leader is re-evaluated, in trading days (63 by default, about a quarter - switching often loses to whipsaw)
  from?: string; // the trading window (YYYY-MM-DD). Indicator warm-up also uses data outside it.
  to?: string;
  // Candidate auto-selection (rotation-pool.ts) - when set, candidates holds the whole seed's data and the pool is
  // re-selected as the poolSize symbols with the highest traded value whenever the pool is unset, cash is waiting, or a re-evaluation is due.
  autoSeed?: { ticker: string; group: string }[];
  poolSize?: number; // 4 by default
  liqDays?: number; // the traded-value averaging window (20 by default)
  // DCA: on entry or a switch, instead of spending the cash at once it buys sliceCash = cash / dcaSlices over
  // dcaSlices trading days (averaging in). Unset or <= 1 keeps the original lump-sum buy.
  dcaSlices?: number;
  // Transaction cost (the one-way fee plus slippage ratio, 0.0025 = 0.25%). Buys shrink to q = floor(cash / (price x (1 + fee)))
  // (the same principle as live's buyableQty), and sale proceeds are multiplied by (1 - fee). Unset or 0 means no cost (as before).
  feeRate?: number;
  // Accumulating - cash of `contribution` arrives every month (at the trading-month boundary). While holding with the
  // regime on it buys more at that day's close (removing cash drag); otherwise it waits as cash for the next entry. Unset or 0 is a lump sum (as before).
  contribution?: number;
}

/** Dual momentum (GEM, Antonacci) - hold the relative-momentum leader, and when absolute momentum fails (the leader
 *  is at or below the defensive asset) move into the defensive asset (IEF bonds, say). Judged each re-evaluation cycle,
 *  all in or out (one symbol), compounding. No SMA regime. */
export interface DualMomentumV1Config {
  principal: number;
  momDays: number; // the momentum lookback in trading days (252 by default, about 12 months)
  momLookbacks?: number[]; // composite momentum (the average of several lookbacks). Unset means the single momDays.
  rebalanceDays: number; // the re-evaluation cycle in trading days (21 by default, about monthly)
  from?: string;
  to?: string;
  feeRate?: number; // the one-way transaction cost
  contribution?: number; // Accumulating: the monthly inflow. Always invested, so it is added to the holding at once. Unset or 0 is a lump sum (as before).
}

/** Volatility-targeted leverage - exposure to a leveraged ETF is adjusted with a partial position to hit a target volatility.
 *  Exposure f = min(maxLeverage, targetVol / realised volatility). With a signal given, breaking the SMA sets f = 0 (cash). */
export interface VolTargetV1Config {
  principal: number;
  targetVolPct: number; // the target annual volatility % (25, say)
  volLookback: number; // the window for computing realised volatility (trading days, 20 by default)
  maxLeverage: number; // the maximum exposure multiple (1.0 by default = within cash)
  rebalanceBand: number; // only readjust when the exposure has drifted this far (0.05 = 5 percentage points by default). Reduces trading.
  smaPeriod?: number; // the signal SMA (a regime filter when given)
  bandPct?: number;
  from?: string;
  to?: string;
  feeRate?: number;
  contribution?: number; // Accumulating: the monthly inflow. Equity rises, the target exposure (f x equity) widens, so only the f share is invested and (1 - f) stays as a buffer. Unset or 0 is a lump sum (as before).
}

/** Laoer's value rebalancing (VR) - a value-averaging evolution that keeps a single leveraged ETF within the band (+/-b)
 *  of the target path V. The account = stock (its valuation) + Pool (cash). Every cycle (2 weeks), V2 = V1 + Pool/G + CF
 *  and the band are recomputed. Each day a band breach rebalances back to the boundary (below the lower -> buy, above
 *  the upper -> sell). The average price is irrelevant (price only). Accumulating, lump-sum and withdrawing modes are supported. */
export interface ValueRebalancingConfig {
  principal: number; // initial total funds (stock + Pool)
  /** G - the risk dial. **Derived from the operating mode when unset** (accumulating and lump-sum 10, withdrawing 20; source 7.1). Larger is more conservative */
  gradient?: number;
  bandPct: number; // band width b (0.15 = +/-15% by default) - tunes trade frequency (low sensitivity)
  /**
   * The Pool's per-cycle buying limit u. **Derived from the operating mode when unset** (accumulating 0.75,
   * lump-sum 0.50, withdrawing 0.25; source chapter 3). The source calls it "only a guide, and yours to choose", so it stays overridable.
   *
   * Note: the source says "75% of the pool **after** the contribution" - the limit is based on the pool after CF (V uses the pool before CF).
   */
  poolLimitPct?: number;
  cycleDays: number; // cycle length (trading days, 10 by default = 2 weeks)
  initStockRatio?: number; // the initial stock:Pool split (0.85 by default = 85:15). Unspecified by the source - approximating the equilibrium cash share
  cashflow?: number; // the cash flow CF per cycle: positive = accumulating, negative = withdrawing, 0 or unset = lump sum
  /**
   * The V update formula (#358). **The skill formula when unset** (what the source uses).
   *
   * - `skill` - `V1 + Pool/G + (E - V1)/(2 sqrt(G)) + CF`. The target path partly follows the actual valuation.
   * - `basic` - `V1 + Pool/G + CF`. It rises mechanically, regardless of the market. In a long decline it burns
   *   through the Pool and V stalls - the "hold on for dear life" mode. Kept for reproducing older blocks.
   */
  formula?: "basic" | "skill";
  feeRate?: number; // the one-way fee plus slippage
  from?: string;
  to?: string;
}

/** Leveraged rotation v1 (LRS, Gayed 2016) - switches a 3x ETF using **a 1x index as the signal**.
 *  Signal close > signal SMA x (1 + band) holds the target (a leveraged ETF); breaking SMA x (1 - band) goes to cash.
 *  The point is using the index SMA, because an SMA on the leveraged ETF itself signals too late (3x volatility). */
export interface LrsV1Config {
  principal: number;
  smaPeriod: number; // the signal SMA (200 by default)
  bandPct: number; // the band hysteresis (0.01 = +/-1% by default)
  trailPct: number; // a trailing stop from the high while held. 0 disables it (the default)
}
