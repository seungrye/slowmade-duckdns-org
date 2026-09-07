/** Shared achievement types (#333). Gathered here so definitions, rules and stats do not tangle. */

/**
 * Tier - makes rarity visible.
 *   bronze  earned by trying once (a first post, a first completion)
 *   silver  earned by persisting (100 of something, 7 days running)
 *   gold    earned deliberately (completing a set, 1000 of something)
 */
export type Tier = 'bronze' | 'silver' | 'gold';

export type AchievementDefinition = {
  key: string;
  name: string;
  description: string;
  /** A react-icons name. It must exist in achievementIconMap in components/icons.tsx. */
  icon: string;
  points: number;
  tier: Tier;
  /** Hides the name and description while locked. Discovering it by accident is the point, so the API masks it server-side. */
  hidden?: boolean;
};

/**
 * Every figure the evaluation needs. **The DB is read once into this, and the evaluation afterwards is pure.**
 * If a new achievement's figure is already here, adding it is one more rule.
 */
export type AchievementStats = {
  postCount: number;
  commentCount: number;
  /** The best a single post received. Amounts spread across posts are not summed - that is what the count ladder measures. */
  maxPostLikes: number;
  maxPostViews: number;
  waRunCount: number;
  /** The ending kinds seen (no duplicates) */
  waEndings: string[];
  /** The protagonists played (no duplicates) */
  waProtagonists: string[];
  /** Whether a run was ever completed with zero contamination */
  waCleanRun: boolean;
  retroRomCount: number;
  retroSaveCount: number;
  /** Days since signing up */
  memberDays: number;
  /** The longest run of consecutive writing days (by KST date) */
  postStreak: number;
  weekendPostCount: number;
  /** Posts written between 0 and 5 in the morning (KST) */
  nightPostCount: number;
  /** Whether the site was ever visited on the birthday itself */
  birthdayVisit: boolean;
};

/** One achievement's evaluation. `current`/`target` become the progress shown on a locked achievement. */
export type Evaluation = {
  key: string;
  unlocked: boolean;
  current: number;
  target: number;
};
