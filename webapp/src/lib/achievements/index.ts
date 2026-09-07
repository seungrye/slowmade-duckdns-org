/** The achievements public API (#333). Outside code imports only this file. */
export { ACHIEVEMENTS } from './definitions';
export { evaluate, emptyStats, ENDING_IDS, PROTAGONISTS } from './rules';
export { collectStats } from './stats';
export { evaluateAndGrant, evaluateAndGrantForPost, achievementView } from './grant';
export type { GrantedAchievement, AchievementView, UnlockedView, LockedView } from './grant';
export type { AchievementDefinition, AchievementStats, Evaluation, Tier } from './types';
