import { connectToDB } from '@/lib/db';
import Achievement from '@/models/achievement';
import User from '@/models/user';
import Post from '@/models/post';
import { ACHIEVEMENTS } from './definitions';
import { evaluate } from './rules';
import { collectStats } from './stats';
import type { AchievementDefinition, Evaluation, Tier } from './types';

/**
 * 부여 결과. `_id` 를 싣는 이유는 토스트(lib/show-achievement-toast.tsx)가 그걸 토스트 id 로
 * 쓰기 때문이다 — 없으면 여러 개가 동시에 열려도 하나만 보인다.
 */
export type GrantedAchievement = AchievementDefinition & { _id: string };

/**
 * 업적 부여와 화면용 조회 (#333) — 부수효과 경계.
 *
 * ── 왜 액션별이 아니라 전체 재평가인가 ────────────────────────────────
 *
 * 예전엔 "글을 쓰면 글 업적만 검사"였다. 업적이 40개가 되고 트리거가 다양해지면 검사 함수가
 * 계속 늘고, **어떤 경로로도 안 불리는 업적**이 생긴다(그게 웹어드벤처가 405번 플레이되도록
 * 업적이 0개였던 이유다).
 *
 * 전체 재평가는 그 문제가 없고, **과거 기록이 자동으로 소급된다** — 별도 마이그레이션 없이
 * 프로필을 여는 순간 밀린 업적이 한꺼번에 열린다.
 *
 * 비용은 조회 몇 번인데, 이미 가진 것은 건너뛰므로 쓰기는 새로 열린 것에만 일어난다.
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

/** 사용자가 이미 가진 업적의 키와 달성 시각. 없거나 오류면 빈 배열. */
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
 * 업적 하나를 부여한다. **이미 가지고 있으면 아무 일도 안 한다** — 조건을 원자적으로 걸어,
 * 동시에 두 번 불려도 포인트가 두 번 오르지 않는다.
 */
async function grantOne(userEmail: string, key: string): Promise<GrantedAchievement | null> {
  const definition = ACHIEVEMENTS[key];
  if (!definition) return null;

  // 정의가 바뀌면(이름·포인트·등급) 여기서 따라 붙는다.
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

  // null 이면 이미 가지고 있었다는 뜻이다 — 정상이라 로그를 남기지 않는다.
  return updated ? { ...definition, _id: String(achievement._id) } : null;
}

/**
 * 전부 다시 판정해 새로 달성한 것을 부여한다.
 *
 * **절대 던지지 않는다.** 업적은 부가 기능이라, 판정이 깨졌다고 글쓰기·덧글이 막히면 안 된다.
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

/** 숨김 업적은 잠긴 동안 가린다. **서버에서** 가려야 devtools 로 들여다봐도 안 보인다. */
function maskIfHidden(definition: AchievementDefinition): { name: string; description: string } {
  return definition.hidden
    ? { name: '???', description: '' }
    : { name: definition.name, description: definition.description };
}

/**
 * 프로필 화면용 — 달성한 것과 도전 중인 것을 갈라 준다.
 * 보기 전에 재평가하므로, 프로필을 여는 것만으로 밀린 업적이 부여된다.
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

  // 최근 달성 순. 도전 중인 것은 목표에 가까운 순 — 다음에 뭘 노릴지 바로 보인다.
  unlocked.sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''));
  locked.sort((a, b) => b.current / b.target - a.current / a.target);

  return { unlocked, locked };
}

/**
 * 글이 반응을 받았을 때 **글쓴이**에게 재평가한다. 누른 사람이 아니다 — 좋아요 업적은
 * 글이 닿은 정도를 재는 것이라 받은 쪽 몫이다.
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
