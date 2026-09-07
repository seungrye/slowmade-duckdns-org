import { ACHIEVEMENTS } from './definitions';
import type { AchievementStats, Evaluation } from './types';

/**
 * Achievement evaluation (#333) - **pure**. It knows nothing of the DB, the clock or the network.
 *
 * One rule is one row of the table. `value` gives the current figure and `target` the goal, so
 *
 *   - whether it unlocks (`current >= target`) and
 *   - the progress shown while locked (`174/250`)
 *
 * come from **one place**. Keeping the condition separate, as before, means computing progress twice and having the two drift.
 *
 * Adding an achievement is one line in `definitions.ts` and one line here.
 */

/**
 * Web-adventure endings - the denominator of the collection achievement. The list's source is types (#352).
 *
 * The six kinds used to be written out here by hand. After endings grew to eleven this value stayed 6, so the
 * "all endings" achievement opened early. It is now only re-exported, so it cannot drift again.
 */
export { ENDING_IDS } from '@/types/web-adventure';
import { ENDING_IDS } from '@/types/web-adventure';

/**
 * Protagonists - the denominator of the collection achievement. The list's source is types (#354).
 * Not written out here, for the same reason as the endings (ENDING_IDS).
 */
export { PROTAGONIST_IDS as PROTAGONISTS } from '@/types/web-adventure';
import { PROTAGONIST_IDS as PROTAGONISTS } from '@/types/web-adventure';

/** Everything at 0 or empty. The starting point for tests and new users. */
export function emptyStats(): AchievementStats {
  return {
    postCount: 0,
    commentCount: 0,
    maxPostLikes: 0,
    maxPostViews: 0,
    waRunCount: 0,
    waEndings: [],
    waProtagonists: [],
    waCleanRun: false,
    retroRomCount: 0,
    retroSaveCount: 0,
    memberDays: 0,
    postStreak: 0,
    weekendPostCount: 0,
    nightPostCount: 0,
    birthdayVisit: false,
  };
}

const yes = (b: boolean) => (b ? 1 : 0);

/** How many distinct features have been tried. For retro, either a ROM or a save counts as having used it. */
function featuresUsed(s: AchievementStats): number {
  return [
    s.postCount > 0,
    s.commentCount > 0,
    s.waRunCount > 0,
    s.retroRomCount > 0 || s.retroSaveCount > 0,
  ].filter(Boolean).length;
}

const FEATURE_COUNT = 4;

type Rule = { key: string; target: number; value: (s: AchievementStats) => number };

const RULES: Rule[] = [
  // Posts
  { key: 'FIRST_POST', target: 1, value: (s) => s.postCount },
  { key: 'POST_COUNT_10', target: 10, value: (s) => s.postCount },
  { key: 'POST_COUNT_50', target: 50, value: (s) => s.postCount },
  { key: 'POST_COUNT_100', target: 100, value: (s) => s.postCount },
  { key: 'POST_COUNT_250', target: 250, value: (s) => s.postCount },
  { key: 'POST_COUNT_500', target: 500, value: (s) => s.postCount },
  { key: 'POST_COUNT_1000', target: 1000, value: (s) => s.postCount },

  // Comments
  { key: 'FIRST_COMMENT', target: 1, value: (s) => s.commentCount },
  { key: 'COMMENT_COUNT_10', target: 10, value: (s) => s.commentCount },
  { key: 'COMMENT_COUNT_50', target: 50, value: (s) => s.commentCount },
  { key: 'COMMENT_COUNT_100', target: 100, value: (s) => s.commentCount },
  { key: 'COMMENT_COUNT_250', target: 250, value: (s) => s.commentCount },
  { key: 'COMMENT_COUNT_500', target: 500, value: (s) => s.commentCount },
  { key: 'COMMENT_COUNT_1000', target: 1000, value: (s) => s.commentCount },

  // How far a post reached - taken as one post's best (a total spread across posts is what the count ladder measures)
  { key: 'POST_10_LIKES', target: 10, value: (s) => s.maxPostLikes },
  { key: 'POST_50_LIKES', target: 50, value: (s) => s.maxPostLikes },
  { key: 'POST_100_VIEWS', target: 100, value: (s) => s.maxPostViews },
  { key: 'POST_1000_VIEWS', target: 1000, value: (s) => s.maxPostViews },

  // Web adventure
  { key: 'WA_FIRST_RUN', target: 1, value: (s) => s.waRunCount },
  { key: 'WA_RUN_10', target: 10, value: (s) => s.waRunCount },
  { key: 'WA_RUN_50', target: 50, value: (s) => s.waRunCount },
  { key: 'WA_RUN_100', target: 100, value: (s) => s.waRunCount },
  { key: 'WA_ENDING_3', target: 3, value: (s) => s.waEndings.length },
  { key: 'WA_ENDING_ALL', target: ENDING_IDS.length, value: (s) => s.waEndings.length },
  { key: 'WA_PROTAGONIST_ALL', target: PROTAGONISTS.length, value: (s) => s.waProtagonists.length },
  { key: 'WA_CLEAN_RUN', target: 1, value: (s) => yes(s.waCleanRun) },

  // Retro
  { key: 'RETRO_FIRST_ROM', target: 1, value: (s) => s.retroRomCount },
  { key: 'RETRO_ROM_10', target: 10, value: (s) => s.retroRomCount },
  { key: 'RETRO_FIRST_SAVE', target: 1, value: (s) => s.retroSaveCount },
  { key: 'RETRO_SAVE_10', target: 10, value: (s) => s.retroSaveCount },

  // Time together
  { key: 'ANNIVERSARY_1', target: 365, value: (s) => s.memberDays },
  { key: 'ANNIVERSARY_2', target: 730, value: (s) => s.memberDays },

  // Rhythm
  { key: 'STREAK_7', target: 7, value: (s) => s.postStreak },
  { key: 'WEEKEND_WRITER', target: 10, value: (s) => s.weekendPostCount },

  // Exploration
  { key: 'EXPLORER_3', target: 3, value: featuresUsed },
  { key: 'EXPLORER_ALL', target: FEATURE_COUNT, value: featuresUsed },

  // Hidden
  { key: 'NIGHT_OWL', target: 1, value: (s) => s.nightPostCount },
  { key: 'BIRTHDAY_VISIT', target: 1, value: (s) => yes(s.birthdayVisit) },
];

export function evaluate(stats: AchievementStats): Evaluation[] {
  return RULES.map(({ key, target, value }) => {
    const raw = value(stats);
    return {
      key,
      unlocked: raw >= target,
      // Progress stops at the target - 300/250 looks wrong on screen.
      current: Math.min(raw, target),
      target,
    };
  });
}

/** Exposed so a drift between the table and the rules (a key on only one side) shows up at once. The test checks this. */
export const RULE_KEYS = RULES.map((r) => r.key);
export const DEFINITION_KEYS = Object.keys(ACHIEVEMENTS);
