// The feedback-note worker's timing constants.
//
// Putting them in route.ts would be outside the exports Next.js App Router allows (POST, maxDuration and so on)
// and fail type checking. Pinning their relative order in a test needs them importable, so they were split out.

// The hard generation timeout. Producing max_tokens=4000 at 2-3 tok/s can take 30+ minutes including prefill,
// so 45 minutes is generous (a short note finishes far earlier on EOS). Shorter, and a long note aborts with fetch failed.
export const GEN_TIMEOUT_MS = 45 * 60 * 1000;

// stale must be **longer** than the generation timeout. Shorter, and a job still running is judged "cut off" and
// picked up again by another tick, which duplicates the generation and exhausts attempts into failed.
// (On a low-spec machine generation really could exceed 30 minutes and fall into this trap.)
export const STALE_MS = GEN_TIMEOUT_MS + 15 * 60 * 1000;
