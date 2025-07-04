import mongoose, { HydratedDocument } from "mongoose";
import { connectToDB } from "./db";
import Achievement from "@/models/achievement";
import User from "@/models/user";
import Post from "@/models/post";
import { UserAchievementType } from "@/types/achievements.d";
import { AchievementType } from "@/models/achievement";
import Comment from "@/models/comment";
 
// Mongoose subdocument type for clarity
type UserAchievementSubdocument = {
  achievement: mongoose.Types.ObjectId;
  unlockedAt: Date;
};

// The type for a subdocument after population, used across functions
type PopulatedUserAchievement = {
  achievement: HydratedDocument<AchievementType>;
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
  POST_COUNT_10: {
    key: 'POST_COUNT_10',
    name: '성실한 작가',
    description: '게시글을 10개 작성했습니다.',
    icon: 'FaPencilAlt',
  },
  POST_COUNT_50: {
    key: 'POST_COUNT_50',
    name: '열정적인 작가',
    description: '게시글을 50개 작성했습니다.',
    icon: 'FaAward',
  },
  POST_COUNT_100: {
    key: 'POST_COUNT_100',
    name: '꾸준한 작가',
    description: '게시글을 100개 작성했습니다.',
    icon: 'FaAward',
  },
  POST_COUNT_250: {
    key: 'POST_COUNT_250',
    name: '성실한 기고가',
    description: '게시글을 250개 작성했습니다.',
    icon: 'FaAward',
  },
  POST_COUNT_500: {
    key: 'POST_COUNT_500',
    name: '커뮤니티의 기둥',
    description: '게시글을 500개 작성했습니다.',
    icon: 'FaTrophy',
  },
  POST_COUNT_1000: {
    key: 'POST_COUNT_1000',
    name: '지식의 대가',
    description: '게시글을 1,000개 작성했습니다.',
    icon: 'FaTrophy',
  },
  POST_COUNT_2500: {
    key: 'POST_COUNT_2500',
    name: '살아있는 전설',
    description: '게시글을 2,500개 작성했습니다.',
    icon: 'FaTrophy',
  },
  POST_COUNT_5000: {
    key: 'POST_COUNT_5000',
    name: '명예의 전당',
    description: '게시글을 5,000개 작성했습니다.',
    icon: 'FaTrophy',
  },
  POST_COUNT_10000: {
    key: 'POST_COUNT_10000',
    name: '사이트의 신',
    description: '게시글을 10,000개 작성했습니다.',
    icon: 'FaTrophy',
  },
  FIRST_COMMENT: {
    key: 'FIRST_COMMENT',
    name: '첫 댓글 작성',
    description: '다른 사람의 글에 처음으로 댓글을 달아 소통을 시작했습니다.',
    icon: 'FaComment',
  },
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
    console.log(`User ${userEmail} already has the achievement '${achievement.name}'.`);
    return null; // Already has it
  }

  // Grant the achievement
  user.achievements.push({ achievement: achievement._id, unlockedAt: new Date() });
  await user.save();
  console.log(`Achievement '${achievement.name}' granted to ${userEmail}`);
  return achievement;
}

/**
 * Checks and grants achievements based on the number of posts.
 * @param userEmail The email of the user.
 * @returns An array of newly unlocked achievements.
 */
export async function checkAndGrantPostCountAchievements(userEmail: string): Promise<HydratedDocument<AchievementType>[]> {
  await connectToDB();

  const postCount = await Post.countDocuments({ userEmail });
  const user = await User.findOne({ email: userEmail }).populate('achievements.achievement');

  if (!user) {
    console.error(`User not found: ${userEmail}`);
    return [];
  }

  const unlockedAchievements: HydratedDocument<AchievementType>[] = [];
  const userAchievementKeys = new Set(user.achievements.map((ach: PopulatedUserAchievement) => ach.achievement.key));

  const achievementChecks = [
    { key: 'FIRST_POST', condition: postCount >= 1 },
    { key: 'POST_COUNT_10', condition: postCount >= 10 },
    { key: 'POST_COUNT_50', condition: postCount >= 50 },
    { key: 'POST_COUNT_100', condition: postCount >= 100 },
    { key: 'POST_COUNT_250', condition: postCount >= 250 },
    { key: 'POST_COUNT_500', condition: postCount >= 500 },
    { key: 'POST_COUNT_1000', condition: postCount >= 1000 },
    { key: 'POST_COUNT_2500', condition: postCount >= 2500 },
    { key: 'POST_COUNT_5000', condition: postCount >= 5000 },
    { key: 'POST_COUNT_10000', condition: postCount >= 10000 },
  ];

  for (const check of achievementChecks) {
    if (check.condition && !userAchievementKeys.has(check.key)) {
      const newAchievement = await grantAchievement(userEmail, check.key);
      if (newAchievement) unlockedAchievements.push(newAchievement);
    }
  }

  return unlockedAchievements;
}

// Check for the "First Comment" achievement
export async function checkAndGrantFirstCommentAchievement(userEmail: string): Promise<HydratedDocument<AchievementType> | null> {
  await connectToDB();

  // 1. Find the user and their achievements.
  const user = await User.findOne({ email: userEmail }, '_id achievements').lean<{ _id: mongoose.Types.ObjectId; achievements: UserAchievementSubdocument[] }>();

  if (!user) {
    console.error("User not found for first comment check");
    return null;
  }

  // 2. Get the ID of the 'FIRST_COMMENT' achievement.
  const achievementDoc = await Achievement.findOne({ key: ACHIEVEMENTS.FIRST_COMMENT.key }, '_id').lean<{ _id: mongoose.Types.ObjectId }>();

  // 3. If the achievement exists in the DB, check if the user already has it.
  if (achievementDoc && user.achievements) {
    const hasAchievement = user.achievements.some((ach) => ach.achievement.equals(achievementDoc._id));
    if (hasAchievement) {
      console.log(`User ${userEmail} already has the FIRST_COMMENT achievement.`);
      return null;
    }
  }

  // 4. Only if the user does NOT have the achievement, count their comments.
  const commentCount = await Comment.countDocuments({ authorId: user._id });

  // 5. Grant the achievement if it's their first comment.
  if (commentCount === 1) {
    return await grantAchievement(userEmail, ACHIEVEMENTS.FIRST_COMMENT.key);
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
    console.warn(`No achievements found for user: ${userEmail}`);
    return [];
  }

  // 3. achievements 필드가 있는 것이 확인된 후에 populate를 실행합니다.
  const populatedUser = await user.populate({
    path: 'achievements.achievement',
    model: 'Achievement'
  });

  return populatedUser.achievements.map((ach: PopulatedUserAchievement) => ({
    achievement: ach.achievement.toObject(),
    unlockedAt: ach.unlockedAt.toISOString(),
  })).sort((a: UserAchievementType, b: UserAchievementType) => new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime());
}