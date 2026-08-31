/** 업적 공개 API (#333). 바깥에서는 이 파일만 import 한다. */
export { ACHIEVEMENTS } from './definitions';
export { evaluate, emptyStats, ENDING_IDS, PROTAGONISTS } from './rules';
export { collectStats } from './stats';
export { evaluateAndGrant, evaluateAndGrantForPost, achievementView } from './grant';
export type { GrantedAchievement, AchievementView, UnlockedView, LockedView } from './grant';
export type { AchievementDefinition, AchievementStats, Evaluation, Tier } from './types';
