/**
 * 오늘의 운세 배치 스케줄러 (#388 → #451).
 *
 * 매매 스케줄러와 **독립**된 60초 틱(서로 안 막게). 자정 직후(KST 00:10)를 지나 오늘 아직
 * 안 돌렸으면 배치 1회. 인메모리 lastRun + 재진입 플래그로 중복 방지 — 재시작하면 멱등
 * catch-up.
 *
 * **한 번에 하나씩 돈다.** 재진입 플래그가 배치끼리 겹치는 것을 막고, 배치 안에서도 타로와
 * 사주를 순차로 부른다(`runFortuneBatch`). 로컬 shim 이 한 장에 ~30초라 동시에 던지면
 * 서로를 굶긴다.
 */
import { runFortuneBatch, shouldRunNow } from "./batch";
import { seoulDateKey } from "@/lib/birthday";

const TICK_MS = 60_000;

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
  // 언제 여는지는 batch.ts 가 안다 (#451) — 여기서 시각을 조립하지 않는다.
  if (!shouldRunNow(now, globalThis.__fortuneLastRun ?? null)) return;
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
  console.log("[fortune] 운세 배치 스케줄러 시작 — 60초 틱, KST 00:10 이후 하루 1회");
}
