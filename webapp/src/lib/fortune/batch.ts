/**
 * The nightly fortune batch (#388) - generates and caches the local LLM's readings in advance.
 *
 * It runs in the small hours after midnight so that a user tapping the toast during the day needs only one DB read
 * (the local Qwen takes about 30 seconds a card, too slow to generate on demand - so it is pushed off-peak).
 *
 * Who: users who have received a fortune within the last 14 days (a proxy for activity - there is no separate
 * lastLogin field). New and dormant users see the template on their first visit, replaced by the LLM's on the next nightly run.
 *
 * Idempotent: documents already at status === 'ready' are skipped, so running several times a day never calls the LLM
 * again (making restart catch-up free). The time gate and duplicate prevention belong to the scheduler.
 */
import { connectToDB } from "@/lib/db";
import DailyFortune from "@/models/daily-fortune";
import { seoulDateKey } from "@/lib/birthday";
import { drawDailyCard } from "./draw";
import { cardById } from "./tarot-deck";
import { generateReading, templateReading } from "./reading";
import { computeSaju, todayIljin, sajuContext, generateSajuReading } from "./saju";
import User from "@/models/user";

/** The KST hour (0-23). Korea has no DST, so it is a fixed UTC+9. */
export function kstHour(now: Date): number {
  return (now.getUTCHours() + 9) % 24;
}

/**
 * Whether the batch should run now (pure). True once the small-hours time has passed and it has not run today.
 * lastRunKey is the dateKey of the last completed batch (in memory). After a restart it is null -> one more run (idempotent).
 */
export function shouldRunBatch(
  hour: number, lastRunKey: string | null, todayKey: string, minHour = 4,
): boolean {
  if (hour < minHour) return false;
  return lastRunKey !== todayKey;
}

/** The dateKey N days ago (KST) - the lower bound for finding target users. */
function daysAgoKey(now: Date, days: number): string {
  return seoulDateKey(new Date(now.getTime() - days * 86400_000));
}

export interface BatchResult {
  dateKey: string;
  targets: number;
  generated: number;
  failed: number;
}

/**
 * Runs today's batch once. It ensures each target has today's document (creating a deterministic card plus a template
 * if absent), then fills in the LLM reading when status !== 'ready'. Failures are swallowed and left as template or failed.
 */
export async function runFortuneBatch(
  now: Date = new Date(),
  log: (m: string) => void = () => {},
): Promise<BatchResult> {
  await connectToDB();
  const dateKey = seoulDateKey(now);
  const since = daysAgoKey(now, 14);

  // Recently active users, plus users whose document for today was already created lazily.
  const recent: string[] = await DailyFortune.distinct("userEmail", { dateKey: { $gte: since } });
  const targets = [...new Set(recent)];
  log(`[fortune] 배치 ${dateKey} — 대상 ${targets.length}명`);

  let generated = 0, failed = 0;
  for (const email of targets) {
    try {
      const { cardId, orientation } = drawDailyCard(email, dateKey);
      const card = cardById(cardId);
      if (!card) continue;

      // Ensure today's document (created from the template if absent).
      await DailyFortune.updateOne(
        { userEmail: email, dateKey },
        { $setOnInsert: {
            userEmail: email, dateKey, cardId, orientation,
            reading: templateReading(card, orientation),
            readingSource: "template", status: "pending", seenAt: null,
          } },
        { upsert: true },
      );

      const doc = await DailyFortune.findOne({ userEmail: email, dateKey }).select("status sajuStatus").lean();

      // The tarot reading - only if the LLM has not filled it yet (idempotent).
      if (doc?.status !== "ready") {
        const { reading, source } = await generateReading(card, orientation);
        await DailyFortune.updateOne(
          { userEmail: email, dateKey },
          { $set: { reading, readingSource: source, status: source === "llm" ? "ready" : "failed" } },
        );
        if (source === "llm") generated++; else failed++;
      }

      // The saju reading - only with a birthday on file and not yet filled. (#390)
      if (doc?.sajuStatus !== "ready") {
        const u = await User.findOne({ email }).select("birthday birthTime").lean<{ birthday?: Date; birthTime?: string | null } | null>();
        if (u?.birthday) {
          const ctx = sajuContext(computeSaju(new Date(u.birthday), u.birthTime), todayIljin(now).pillar);
          const sr = await generateSajuReading(ctx);
          await DailyFortune.updateOne(
            { userEmail: email, dateKey },
            { $set: { sajuReading: sr.reading, sajuSource: sr.source, sajuStatus: sr.source === "llm" ? "ready" : "failed" } },
          );
        }
      }
    } catch (e) {
      failed++;
      log(`[fortune] ${email} 실패: ${e instanceof Error ? e.message : e}`);
    }
  }
  log(`[fortune] 배치 완료 — 생성 ${generated} · 실패/템플릿 ${failed}`);
  return { dateKey, targets: targets.length, generated, failed };
}
