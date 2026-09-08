// Next.js instrumentation - run once as the server process starts (a stable Next 15 feature).
// The trading scheduler starts here: right after a deploy or restart the first tick catches up, from the DB, on any
// cycle that is "past its run time and not run today" (the Mongo claim guarantees blue-green safety).

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTradingScheduler } = await import("@/lib/trading/scheduler");
    startTradingScheduler();
    // The daily fortune's night batch (#388) - a scheduler independent of the trading one.
    const { startFortuneScheduler } = await import("@/lib/fortune/scheduler");
    startFortuneScheduler();
  }
}
