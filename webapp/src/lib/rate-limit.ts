// A simple in-memory sliding-window rate limit - to blunt spam and DoS on public endpoints (comments and the like).
// Suited to a single active instance (a home server, or only one side of blue/green taking traffic). The counter resets
// on deploy, which is fine for discouraging abuse. If multi-instance accuracy is needed, swap in a Redis or Mongo backend.

const buckets = new Map<string, number[]>();

/**
 * Allows up to limit calls for key within windowMs. True when allowed (and the request is recorded), false when over.
 * @param nowMs the current time (injectable for tests). Date.now() by default.
 */
export function rateLimit(key: string, limit: number, windowMs: number, nowMs: number = Date.now()): boolean {
  const recent = (buckets.get(key) ?? []).filter((t) => nowMs - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent); // kept pruned of old entries
    return false;
  }
  recent.push(nowMs);
  buckets.set(key, recent);
  return true;
}

/** For resetting in tests and operations. */
export function __resetRateLimit(): void {
  buckets.clear();
}

/**
 * Extracting the client IP behind a proxy (#386).
 *
 * **Never use the first X-Forwarded-For entry.** With
 * `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`, nginx **appends** the real IP to whatever XFF the
 * client sent - so the first entry is the attacker's value, and using it as the bucket key lets them bypass the rate
 * limit by changing XFF every time.
 *
 * Priority:
 *  1. `X-Real-IP` - nginx sets it from `$remote_addr` (the TCP peer). `proxy_set_header` **overwrites** the same
 *     header from the client, so it cannot be forged (assuming a single edge proxy).
 *  2. The **last** XFF entry - the real IP nginx appended. The fallback on paths without X-Real-IP.
 *  3. 'unknown'.
 */
export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}
