/**
 * The nightly fortune batch scheduler (#388).
 *
 * A 60-second tick **independent** of the trading scheduler (so neither blocks the other). Once the small-hours (KST)
 * time has passed and it has not run today, it runs the batch once. An in-memory lastRun plus a re-entry flag prevent
 * duplicates - a restart gives an idempotent catch-up.
 */
import { runFortuneBatch, shouldRunBatch, kstHour } from "./batch";
import { seoulDateKey } from "@/lib/birthday";

const TICK_MS = 60_000;
const BATCH_MIN_HOUR = 4; // after 04:00 KST

declare global {
  // eslint-disable-next-line no-var
  var __fortuneLastRun: string | null | undefined;
  // eslint-disable-next-line no-var
  var __fortuneBatchRunning: boolean | undefined;
}

async function tick(): Promise<void> {
  if (globalThis.__fortuneBatchRunning) return;
  const now = new Date();
  const todayKey = seoulDateKey(now);
  if (!shouldRunBatch(kstHour(now), globalThis.__fortuneLastRun ?? null, todayKey, BATCH_MIN_HOUR)) {
    return;
  }
  globalThis.__fortuneBatchRunning = true;
  try {
    await runFortuneBatch(now, (m) => console.log(m));
    globalThis.__fortuneLastRun = todayKey; // mark today as done
  } catch (e) {
    console.error("[fortune] 배치 실패:", e);
  } finally {
    globalThis.__fortuneBatchRunning = false;
  }
}

export function startFortuneScheduler(): void {
  const safeTick = () => { tick().catch((e) => console.error("[fortune] tick 실패:", e)); };
  // Slightly later, so it does not collide with the trading scheduler (which starts 10 seconds in).
  setTimeout(safeTick, 20_000);
  setInterval(safeTick, TICK_MS);
  console.log("[fortune] 운세 배치 스케줄러 시작 — 60초 틱, KST 새벽 1회");
}
