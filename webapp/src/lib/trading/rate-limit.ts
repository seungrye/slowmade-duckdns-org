// Global serialisation of broker API calls - every call in the process is queued at least a minimum interval apart (1 second by default).
// Matching Python's kis/ratelimit.py (a minimum interval between calls, not an average). A conservative value that is
// safe for both KIS's 2 per second and Toss's per-group TPS. Server only.

const MIN_INTERVAL_MS = Number(process.env.TRADING_API_MIN_INTERVAL_MS ?? 1000);

let last = 0;
let chain: Promise<void> = Promise.resolve();

export function throttle(): Promise<void> {
  const next = chain.then(async () => {
    const wait = last + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
  });
  // Keep a copy with its own catch, so a failed earlier call does not break the chain.
  chain = next.catch(() => undefined);
  return next;
}
