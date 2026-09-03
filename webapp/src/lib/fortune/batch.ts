/**
 * 오늘의 운세 밤 배치 (#388) — 로컬 LLM 풀이를 미리 생성해 캐시한다.
 *
 * 낮에 사용자가 토스트를 누르면 DB 읽기 한 번이면 되도록, 자정 이후 새벽에 미리 돌린다
 * (로컬 Qwen 은 장당 ~30초라 즉석 생성이 느리다 — off-peak 로 밀어 둔다).
 *
 * 대상: 최근 14일 안에 운세를 받은 적 있는 사용자(활동 프록시 — 별도 lastLogin 필드가 없다).
 * 신규/휴면 사용자는 첫 방문에 템플릿을 보고, 그다음 밤 배치에서 LLM 으로 교체된다.
 *
 * 멱등: 이미 status==='ready' 인 문서는 건너뛴다. 그래서 하루 여러 번 돌아도 LLM 을 다시
 * 부르지 않는다(재시작 catch-up 이 공짜). 시간 게이트·중복 방지는 scheduler 가 맡는다.
 */
import { connectToDB } from "@/lib/db";
import DailyFortune from "@/models/daily-fortune";
import { seoulDateKey } from "@/lib/birthday";
import { drawDailyCard } from "./draw";
import { cardById } from "./tarot-deck";
import { generateReading, templateReading } from "./reading";
import { computeSaju, todayIljin, sajuContext, generateSajuReading } from "./saju";
import User from "@/models/user";

/** KST 시(0-23). 한국은 DST 가 없어 UTC+9 고정. */
export function kstHour(now: Date): number {
  return (now.getUTCHours() + 9) % 24;
}

/**
 * 배치를 지금 돌려야 하나(순수). 새벽 시각을 지났고 오늘 아직 안 돌렸으면 true.
 * lastRunKey 는 마지막으로 배치를 끝낸 dateKey(인메모리). 재시작하면 null → 한 번 더(멱등).
 */
export function shouldRunBatch(
  hour: number, lastRunKey: string | null, todayKey: string, minHour = 4,
): boolean {
  if (hour < minHour) return false;
  return lastRunKey !== todayKey;
}

/** N일 전 dateKey(KST) — 대상 사용자 조회 하한. */
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
 * 오늘 배치 1회 실행. 각 대상의 오늘 문서를 보장(없으면 결정론 카드+템플릿)한 뒤,
 * status!=='ready' 면 LLM 풀이로 채운다. 실패는 삼키고 template/failed 로 남긴다.
 */
export async function runFortuneBatch(
  now: Date = new Date(),
  log: (m: string) => void = () => {},
): Promise<BatchResult> {
  await connectToDB();
  const dateKey = seoulDateKey(now);
  const since = daysAgoKey(now, 14);

  // 최근 활동 사용자 ∪ 오늘 이미 만들어진(lazy) 문서의 사용자.
  const recent: string[] = await DailyFortune.distinct("userEmail", { dateKey: { $gte: since } });
  const targets = [...new Set(recent)];
  log(`[fortune] 배치 ${dateKey} — 대상 ${targets.length}명`);

  let generated = 0, failed = 0;
  for (const email of targets) {
    try {
      const { cardId, orientation } = drawDailyCard(email, dateKey);
      const card = cardById(cardId);
      if (!card) continue;

      // 오늘 문서 보장(없으면 템플릿으로 생성).
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

      // 타로 풀이 — 아직 LLM 으로 안 채웠으면(멱등).
      if (doc?.status !== "ready") {
        const { reading, source } = await generateReading(card, orientation);
        await DailyFortune.updateOne(
          { userEmail: email, dateKey },
          { $set: { reading, readingSource: source, status: source === "llm" ? "ready" : "failed" } },
        );
        if (source === "llm") generated++; else failed++;
      }

      // 사주 풀이 — 생일이 있고 아직 안 채웠으면. (#390)
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
