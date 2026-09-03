/**
 * 오늘의 운세 밤 배치 스케줄러 (#388).
 *
 * 매매 스케줄러와 **독립**된 60초 틱(서로 안 막게). 새벽(KST) 지나 오늘 아직 안 돌렸으면
 * 배치 1회. 인메모리 lastRun + 재진입 플래그로 중복 방지 — 재시작하면 멱등 catch-up.
 */
import { runFortuneBatch, shouldRunBatch, kstHour } from "./batch";
import { seoulDateKey } from "@/lib/birthday";

const TICK_MS = 60_000;
const BATCH_MIN_HOUR = 4; // KST 04시 이후

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
    globalThis.__fortuneLastRun = todayKey; // 오늘 완료 표시
  } catch (e) {
    console.error("[fortune] 배치 실패:", e);
  } finally {
    globalThis.__fortuneBatchRunning = false;
  }
}

export function startFortuneScheduler(): void {
  const safeTick = () => { tick().catch((e) => console.error("[fortune] tick 실패:", e)); };
  // 매매 스케줄러(10초 뒤)와 겹치지 않게 살짝 늦게.
  setTimeout(safeTick, 20_000);
  setInterval(safeTick, TICK_MS);
  console.log("[fortune] 운세 배치 스케줄러 시작 — 60초 틱, KST 새벽 1회");
}
