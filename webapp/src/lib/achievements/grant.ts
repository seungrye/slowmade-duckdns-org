import { connectToDB } from '@/lib/db';
import Achievement from '@/models/achievement';
import User from '@/models/user';
import Post from '@/models/post';
import { ACHIEVEMENTS } from './definitions';
import { evaluate } from './rules';
import { collectStats } from './stats';
import type { AchievementDefinition, Evaluation, Tier } from './types';

/**
 * The result of granting. `_id` is included because the toast (lib/show-achievement-toast.tsx) uses it as the toast
 * id - without it, several opening at once would show only one.
 */
export type GrantedAchievement = AchievementDefinition & { _id: string };

/**
 * Granting achievements and reading them for the UI (#333) - the side-effect boundary.
 *
 * ── Why re-evaluate everything rather than per action ─────────────────
 *
 * It used to be "writing a post checks only the post achievements". With 40 achievements and varied triggers the
 * check functions keep multiplying and some achievement ends up **reachable by no path at all** (which is why the web
 * adventure could be played 405 times with zero achievements).
 *
 * Re-evaluating everything has none of that problem, and **past activity is credited retroactively** - opening the
 * profile opens the whole backlog at once, with no migration.
 *
 * The cost is a few queries, and since what is already held is skipped, writes happen only for what newly opened.
 */

export type UnlockedView = {
  key: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  tier: Tier;
  unlockedAt: string | null;
};

export type LockedView = {
  key: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  tier: Tier;
  current: number;
  target: number;
  hidden: boolean;
};

export type AchievementView = { unlocked: UnlockedView[]; locked: LockedView[] };

type OwnedEntry = { key: string; unlockedAt: Date | null };

/** The keys and times of the achievements a user already holds. Empty on absence or error. */
async function ownedAchievements(userEmail: string): Promise<OwnedEntry[] | null> {
  const user = await User.findOne({ email: userEmail });
  if (!user) return null;

  const populated = await user.populate({ path: 'achievements.achievement', model: 'Achievement' });
  const list = (populated.achievements ?? []) as {
    achievement?: { key?: string };
    unlockedAt?: Date;
  }[];

  return list
    .filter((a) => a.achievement?.key)
    .map((a) => ({ key: a.achievement!.key!, unlockedAt: a.unlockedAt ?? null }));
}

/**
 * Grants one achievement. **If it is already held, nothing happens** - the condition is applied atomically, so two
 * concurrent calls cannot award the points twice.
 */
async function grantOne(userEmail: string, key: string): Promise<GrantedAchievement | null> {
  const definition = ACHIEVEMENTS[key];
  if (!definition) return null;

  // A changed definition (name, points, tier) is picked up here.
  const achievement = await Achievement.findOneAndUpdate({ key }, definition, {
    upsert: true,
    new: true,
  });
  if (!achievement) return null;

  const updated = await User.findOneAndUpdate(
    { email: userEmail, 'achievements.achievement': { $ne: achievement._id } },
    {
      $push: { achievements: { achievement: achievement._id, unlockedAt: new Date() } },
      $inc: { points: definition.points },
    },
  );

  // null means it was already held - normal, so nothing is logged.
  return updated ? { ...definition, _id: String(achievement._id) } : null;
}

/**
 * Re-evaluates everything and grants what has newly been earned.
 *
 * **It never throws.** Achievements are an extra, so a broken evaluation must never block writing a post or a comment.
 */
export async function evaluateAndGrant(
  userEmail: string,
  now: Date = new Date(),
): Promise<GrantedAchievement[]> {
  try {
    await connectToDB();

    const owned = await ownedAchievements(userEmail);
    if (owned === null) return [];

    const ownedKeys = new Set(owned.map((o) => o.key));
    const stats = await collectStats(userEmail, now);

    const newlyUnlocked = evaluate(stats)
      .filter((e) => e.unlocked && !ownedKeys.has(e.key))
      .map((e) => e.key);

    const granted: GrantedAchievement[] = [];
    for (const key of newlyUnlocked) {
      const definition = await grantOne(userEmail, key);
      if (definition) granted.push(definition);
    }
    return granted;
  } catch (error) {
    console.error('업적 판정 실패:', error);
    return [];
  }
}

/** A hidden achievement is masked while locked. Masking **on the server** keeps it hidden even from devtools. */
function maskIfHidden(definition: AchievementDefinition): { name: string; description: string } {
  return definition.hidden
    ? { name: '???', description: '' }
    : { name: definition.name, description: definition.description };
}

/**
 * For the profile screen - splits what is earned from what is in progress.
 * It re-evaluates before reading, so opening the profile grants the backlog.
 */
export async function achievementView(
  userEmail: string,
  now: Date = new Date(),
): Promise<AchievementView> {
  await evaluateAndGrant(userEmail, now);

  const owned = (await ownedAchievements(userEmail)) ?? [];
  const unlockedAtByKey = new Map(owned.map((o) => [o.key, o.unlockedAt]));

  let evaluations: Evaluation[] = [];
  try {
    evaluations = evaluate(await collectStats(userEmail, now));
  } catch (error) {
    console.error('업적 진행도 계산 실패:', error);
  }

  const unlocked: UnlockedView[] = [];
  const locked: LockedView[] = [];

  for (const evaluation of evaluations) {
    const definition = ACHIEVEMENTS[evaluation.key];
    if (!definition) continue;

    const common = {
      key: definition.key,
      icon: definition.icon,
      points: definition.points,
      tier: definition.tier,
    };

    if (unlockedAtByKey.has(definition.key)) {
      const at = unlockedAtByKey.get(definition.key) ?? null;
      unlocked.push({
        ...common,
        name: definition.name,
        description: definition.description,
        unlockedAt: at ? new Date(at).toISOString() : null,
      });
    } else {
      locked.push({
        ...common,
        ...maskIfHidden(definition),
        current: evaluation.current,
        target: evaluation.target,
        hidden: definition.hidden === true,
      });
    }
  }

  // Earned ones newest first. In-progress ones closest to their target first - so what to aim at next is immediately visible.
  unlocked.sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''));
  locked.sort((a, b) => b.current / b.target - a.current / a.target);

  return { unlocked, locked };
}

/**
 * Re-evaluates for the **author** when a post gets a reaction, not for whoever pressed it - a like achievement
 * measures how far a post reached, so it belongs to the receiving side.
 */
export async function evaluateAndGrantForPost(
  postId: string,
  now: Date = new Date(),
): Promise<GrantedAchievement[]> {
  try {
    await connectToDB();
    const post = await Post.findById(postId).select('userEmail').lean<{ userEmail?: string } | null>();
    if (!post?.userEmail) return [];
    return await evaluateAndGrant(post.userEmail, now);
  } catch (error) {
    console.error('글 업적 판정 실패:', error);
    return [];
  }
}
