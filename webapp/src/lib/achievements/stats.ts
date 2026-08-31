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
 * 업적 판정에 쓸 수치를 모은다 (#333) — **DB 를 아는 유일한 곳**.
 *
 * 판정(rules.ts)은 순수라 여기서 모은 값만 본다. 그래서 새 업적이 기존 수치로 판정되면
 * 이 파일은 손대지 않아도 된다.
 *
 * 조회 하나가 실패해도 **전체를 포기하지 않는다.** 업적은 부가 기능이라, 웹어드벤처 집계가
 * 깨졌다고 글 업적까지 못 받으면 안 된다. 실패한 항목만 0 으로 두고 나머지로 판정한다.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** 실패해도 판정을 멈추지 않는다. 실패한 값만 기본값으로 둔다. */
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
    // 글은 한 번만 읽어 개수·최고치·리듬을 한꺼번에 뽑는다.
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
    // 생일 업적은 "생일에 들렀다"는 뜻이라, 이 함수가 불린 시점이 곧 방문 시점이다.
    birthdayVisit: user.birthday ? isBirthdayToday(new Date(user.birthday), now) : false,
  };
}
