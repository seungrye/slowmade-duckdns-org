import { AchievementType } from "../models/achievement";

export type UserAchievementType = {
  achievement: AchievementType;
  unlockedAt: string; // Date will be serialized to string
};