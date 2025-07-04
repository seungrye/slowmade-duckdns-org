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
export async function grantAchievement(userEmail: string, achievementKey: string): Promise<HydratedDocument<AchievementType> | null> {
  await connectToDB();

  const achievementData = ACHIEVEMENTS[achievementKey];
  if (!achievementData) {
    console.error(`Achievement with key ${achievementKey} not defined.`);
    return null;
  }

  const user = await User.findOne({ email: userEmail });
  const achievement = await Achievement.findOneAndUpdate({ key: achievementKey }, achievementData, { upsert: true, new: true });

  if (!user || !achievement) {
    console.error("User or Achievement not found");
    return null;
  }

  // Check if the user already has this achievement
  const hasAchievement = user.achievements.some(
    (userAch: UserAchievementSubdocument) => userAch.achievement.equals(achievement._id)
  );

  if (hasAchievement) {
    return null; // Already has it
  }

  // Grant the achievement
  user.achievements.push({ achievement: achievement._id, unlockedAt: new Date() });
  await user.save();
  console.log(`Achievement '${achievement.name}' granted to ${userEmail}`);
  return achievement;
}

// Check for the "First Post" achievement
export async function checkAndGrantFirstPostAchievement(userEmail: string): Promise<HydratedDocument<AchievementType> | null> {
  await connectToDB();

  // Optimization: First, check if the user already has the achievement to avoid expensive queries.
  // 1. Find the user's achievements array. .lean() makes it a fast, read-only query.
  const user = await User.findOne({ email: userEmail }, 'achievements').lean<{ achievements: UserAchievementSubdocument[] }>();

  // If user doesn't exist, we can't proceed.
  if (!user) {
    console.error("User not found");
    return null;
  }

  // 2. Get the ID of the 'FIRST_POST' achievement. This is also a fast, indexed query.
  const achievementDoc = await Achievement.findOne({ key: ACHIEVEMENTS.FIRST_POST.key }, '_id').lean<{ _id: mongoose.Types.ObjectId }>();

  // 3. If the achievement exists in the DB, check if the user already has it.
  if (achievementDoc && user.achievements) {
    const hasAchievement = user.achievements.some(
      (ach: UserAchievementSubdocument) => ach.achievement.equals(achievementDoc._id)
    );
    // If they have it, we're done. No need to count posts.
    if (hasAchievement) return null;
  }

  // 4. Only if the user does NOT have the achievement, count their posts.
  const postCount = await Post.countDocuments({ userEmail });

  // 5. Grant the achievement if it's their first post.
  if (postCount === 1) {
    return await grantAchievement(userEmail, ACHIEVEMENTS.FIRST_POST.key);
  }

  return null;
}

// Get achievements for a user
export async function getMyAchievements(userEmail: string): Promise<UserAchievementType[]> {
  await connectToDB();

  // 1. 먼저 사용자를 찾습니다.
  const user = await User.findOne({ email: userEmail });

  // 2. 사용자가 없거나, achievements 필드가 없거나, 비어있으면 빈 배열을 반환합니다.
  //    이렇게 하면 데이터가 없는 오래된 사용자에 대해 populate를 시도하지 않아 오류를 방지합니다.
  if (!user || !user.achievements || user.achievements.length === 0) {
    return [];
  }

  // 3. achievements 필드가 있는 것이 확인된 후에 populate를 실행합니다.
  const populatedUser = await user.populate({
    path: 'achievements.achievement',
    model: 'Achievement'
  });

  // The type for a subdocument after population
  type PopulatedUserAchievement = {
    achievement: HydratedDocument<AchievementType>;
    unlockedAt: Date;
  };

  return populatedUser.achievements.map((ach: PopulatedUserAchievement) => ({
    achievement: ach.achievement.toObject(),
    unlockedAt: ach.unlockedAt.toISOString(),
  })).sort((a: UserAchievementType, b: UserAchievementType) => new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime());
}