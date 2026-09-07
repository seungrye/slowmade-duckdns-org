import { connectToDB } from '@/lib/db';
import User from '@/models/user';
import Post from '@/models/post';
import Comment from '@/models/comment';
import PastRun from '@/models/web-adventure-past-run';
import RetroRom from '@/models/retro-rom';
import RetroSaveState from '@/models/retro-save-state';
import { isBirthdayToday } from '@/lib/birthday';
import { postRhythm } from './rhythm';
import { emptyStats } from './rules';
import type { AchievementStats } from './types';

/**
 * Gathers the figures the evaluation needs (#333) - **the only place that knows the DB**.
 *
 * The evaluation (rules.ts) is pure and sees only what is gathered here, so a new achievement judged from existing
 * figures needs no change to this file.
 *
 * **One failed query does not abandon the rest.** Achievements are an extra, so a broken web-adventure aggregate must
 * not cost someone their post achievements. A failed item is left at 0 and the rest is evaluated.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A failure does not stop the evaluation. Only the failed value falls back to its default. */
async function safely<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`업적 통계 수집 실패(${label}):`, error);
    return fallback;
  }
}

export async function collectStats(userEmail: string, now: Date = new Date()): Promise<AchievementStats> {
  await connectToDB();

  const user = await User.findOne({ email: userEmail }).select('_id createdAt birthday').lean<
    { _id: unknown; createdAt?: Date; birthday?: Date } | null
  >();
  if (!user) return emptyStats();

  const base = emptyStats();

  const [posts, commentCount, wa, retroRomCount, retroSaveCount] = await Promise.all([
    // Posts are read once, yielding the count, the best figures and the rhythm together.
    safely('글', [] as { likes?: number; views?: number; createdAt: Date }[], () =>
      Post.find({ userEmail, isDeleted: { $ne: true } })
        .select('likes views createdAt')
        .lean<{ likes?: number; views?: number; createdAt: Date }[]>()
    ),
    safely('덧글', 0, () => Comment.countDocuments({ authorId: user._id })),
    safely('웹어드벤처', { count: 0, endings: [] as string[], protagonists: [] as string[], clean: false }, async () => {
      const runs = await PastRun.find({ userEmail })
        .select('endingId character.protagonist character.stigmaErosion')
        .lean<{ endingId?: string; character?: { protagonist?: string; stigmaErosion?: number } }[]>();
      return {
        count: runs.length,
        endings: [...new Set(runs.map((r) => r.endingId).filter((v): v is string => !!v))],
        protagonists: [...new Set(runs.map((r) => r.character?.protagonist).filter((v): v is string => !!v))],
        clean: runs.some((r) => r.character?.stigmaErosion === 0),
      };
    }),
    safely('레트로 롬', 0, () => RetroRom.countDocuments({ userEmail })),
    safely('레트로 세이브', 0, () => RetroSaveState.countDocuments({ userEmail })),
  ]);

  const rhythm = postRhythm(posts.map((p) => new Date(p.createdAt)));

  return {
    ...base,
    postCount: posts.length,
    commentCount,
    maxPostLikes: Math.max(0, ...posts.map((p) => p.likes ?? 0)),
    maxPostViews: Math.max(0, ...posts.map((p) => p.views ?? 0)),
    waRunCount: wa.count,
    waEndings: wa.endings,
    waProtagonists: wa.protagonists,
    waCleanRun: wa.clean,
    retroRomCount,
    retroSaveCount,
    memberDays: user.createdAt
      ? Math.floor((now.getTime() - new Date(user.createdAt).getTime()) / DAY_MS)
      : 0,
    postStreak: rhythm.streak,
    weekendPostCount: rhythm.weekend,
    nightPostCount: rhythm.night,
    // The birthday achievement means "visited on the birthday", so the moment this function is called is the visit.
    birthdayVisit: user.birthday ? isBirthdayToday(new Date(user.birthday), now) : false,
  };
}
