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
/**
 * 자정(KST)으로부터 몇 분인가.
 *
 * 예전엔 시(hour) 단위였는데 **00:10 을 표현할 수 없었다** (#451). 한국은 DST 가 없어
 * UTC+9 고정이라 오프셋만 더하면 된다.
 */
export function kstMinutes(now: Date): number {
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + 9 * 60) % 1440;
}

/**
 * 배치를 여는 시각 — 자정 + 10분 (#451).
 *
 * 04시였고, 그것이 "사주가 매일 같은 값" 제보의 실제 원인이었다. 사람은 자정 직후에
 * 운세를 열어 보는데 그때는 배치 전이라 lazy 생성이 넣어 둔 **템플릿 폴백**만 보인다.
 * DB 가 그대로 말해 줬다 — 9/10 문서는 KST 01:36 에 만들어져 01:36 에 조회됐고 그때
 * sajuSource 가 template 이었으며, LLM 이 채워진 건 몇 시간 뒤였다.
 *
 * 자정 정각이 아니라 10분인 것은 날짜 경계에서 `seoulDateKey` 와 어긋나지 않게 여유를
 * 두려는 것이다.
 */
export const BATCH_AFTER_MINUTES = 10;

/**
 * 배치를 지금 돌려야 하나(순수). 여는 시각을 지났고 오늘 아직 안 돌렸으면 true.
 * lastRunKey 는 마지막으로 배치를 끝낸 dateKey(인메모리). 재시작하면 null → 한 번 더(멱등).
 */
export function shouldRunBatch(
  minutes: number, lastRunKey: string | null, todayKey: string,
  minMinutes = BATCH_AFTER_MINUTES,
): boolean {
  if (minutes < minMinutes) return false;
  return lastRunKey !== todayKey;
}

/**
 * 시각 계산까지 여기서 끝낸다 — 부르는 쪽(스케줄러)은 "지금 돌릴까"만 묻는다.
 *
 * 예전엔 스케줄러가 `kstHour`·상수·`seoulDateKey` 를 직접 조립했다. 그러면 시각 규칙이
 * 두 파일에 걸쳐 있어 바꿀 때마다 양쪽을 봐야 하고, 스케줄러는 타이머·전역 상태 때문에
 * 단위 시험이 어렵다. 결정을 이리로 내리면 **실제 Date 로 시험할 수 있다.**
 */
export function shouldRunNow(now: Date, lastRunKey: string | null): boolean {
  return shouldRunBatch(kstMinutes(now), lastRunKey, seoulDateKey(now));
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
