import mongoose, { HydratedDocument } from "mongoose";
import { connectToDB } from "./db";
import Achievement from "@/models/achievement";
import User from "@/models/user";
import Post from "@/models/post";
import { UserAchievementType } from "@/types/achievements.d";
import { AchievementType } from "@/models/achievement";

// Mongoose subdocument type for clarity
type UserAchievementSubdocument = {
  achievement: mongoose.Types.ObjectId;
  unlockedAt: Date;
};

type AchievementDefinition = {
  key: string;
  name: string;
  description: string;
  icon: string;
};

// Predefined achievements
export const ACHIEVEMENTS: { [key: string]: AchievementDefinition } = {
  FIRST_POST: {
    key: 'FIRST_POST',
    name: '첫 글 작성',
    description: '첫 번째 유머 글을 작성하여 커뮤니티에 기여했습니다.',
    icon: 'FaPencilAlt',
  },
  // ... 여기에 다른 업적들을 추가할 수 있습니다.
};

// Grant an achievement to a user
export async function grantAchievement(userEmail: string, achievementKey: string): Promise<boolean> {
  await connectToDB();

  const achievementData = ACHIEVEMENTS[achievementKey];
  if (!achievementData) {
    console.error(`Achievement with key ${achievementKey} not defined.`);
    return false;
  }

  const user = await User.findOne({ email: userEmail });
  const achievement = await Achievement.findOneAndUpdate({ key: achievementKey }, achievementData, { upsert: true, new: true });

  if (!user || !achievement) {
    console.error("User or Achievement not found");
    return false;
  }

  // Check if the user already has this achievement
  const hasAchievement = user.achievements.some(
    (userAch: UserAchievementSubdocument) => userAch.achievement.equals(achievement._id)
  );

  if (hasAchievement) {
    return false; // Already has it
  }

  // Grant the achievement
  user.achievements.push({ achievement: achievement._id, unlockedAt: new Date() });
  await user.save();
  console.log(`Achievement '${achievement.name}' granted to ${userEmail}`);
  return true;
}

// Check for the "First Post" achievement
export async function checkAndGrantFirstPostAchievement(userEmail: string) {
  await connectToDB();
  const postCount = await Post.countDocuments({ userEmail });

  // This function is called after a new post is saved, so count should be 1 for the first post.
  if (postCount === 1) {
    await grantAchievement(userEmail, ACHIEVEMENTS.FIRST_POST.key);
  }
}

// Get achievements for a user
export async function getMyAchievements(userEmail: string): Promise<UserAchievementType[]> {
  await connectToDB();
  const user = await User.findOne({ email: userEmail }).populate({
    path: 'achievements.achievement',
    model: 'Achievement'
  });

  if (!user || !user.achievements) {
    return [];
  }

  // The type for a subdocument after population
  type PopulatedUserAchievement = {
    achievement: HydratedDocument<AchievementType>;
    unlockedAt: Date;
  };

  return user.achievements.map((ach: PopulatedUserAchievement) => ({
    achievement: ach.achievement.toObject(),
    unlockedAt: ach.unlockedAt.toISOString(),
  })).sort((a: UserAchievementType, b: UserAchievementType) => new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime());
}