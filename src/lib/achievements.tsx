import { HydratedDocument } from "mongoose";
import { connectToDB } from "./db";
import Achievement from "@/models/achievement";
import User from "@/models/user";
import Post from "@/models/post";
import { UserAchievementType } from "@/types/achievements.d";
import { AchievementType } from "@/models/achievement";
import Comment from "@/models/comment";
 
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
  points: number;
};

// Predefined achievements
export const ACHIEVEMENTS: { [key: string]: AchievementDefinition } = {
  FIRST_POST: {
    key: 'FIRST_POST',
    name: '첫 글 작성',
    description: '첫 번째 유머 글을 작성하여 커뮤니티에 기여했습니다.',
    icon: 'FaPencilAlt',
    points: parseInt(process.env.ACHIEVEMENT_FIRST_POST_POINTS || '10', 10),
  },
  POST_COUNT_10: {
    key: 'POST_COUNT_10',
    name: '성실한 작가',
    description: '게시글을 10개 작성했습니다.',
    icon: 'FaPencilAlt',
    points: parseInt(process.env.ACHIEVEMENT_POST_COUNT_10_POINTS || '20', 10),
  },
  POST_COUNT_50: {
    key: 'POST_COUNT_50',
    name: '열정적인 작가',
    description: '게시글을 50개 작성했습니다.',
    icon: 'FaAward',
    points: parseInt(process.env.ACHIEVEMENT_POST_COUNT_50_POINTS || '50', 10),
  },
  POST_COUNT_100: {
    key: 'POST_COUNT_100',
    name: '꾸준한 작가',
    description: '게시글을 100개 작성했습니다.',
    icon: 'FaAward',
    points: parseInt(process.env.ACHIEVEMENT_POST_COUNT_100_POINTS || '100', 10),
  },
  POST_COUNT_250: {
    key: 'POST_COUNT_250',
    name: '성실한 기고가',
    description: '게시글을 250개 작성했습니다.',
    icon: 'FaAward',
    points: parseInt(process.env.ACHIEVEMENT_POST_COUNT_250_POINTS || '250', 10),
  },
  POST_COUNT_500: {
    key: 'POST_COUNT_500',
    name: '커뮤니티의 기둥',
    description: '게시글을 500개 작성했습니다.',
    icon: 'FaTrophy',
    points: parseInt(process.env.ACHIEVEMENT_POST_COUNT_500_POINTS || '500', 10),
  },
  POST_COUNT_1000: {
    key: 'POST_COUNT_1000',
    name: '지식의 대가',
    description: '게시글을 1,000개 작성했습니다.',
    icon: 'FaTrophy',
    points: parseInt(process.env.ACHIEVEMENT_POST_COUNT_1000_POINTS || '1000', 10),
  },
  POST_COUNT_2500: {
    key: 'POST_COUNT_2500',
    name: '살아있는 전설',
    description: '게시글을 2,500개 작성했습니다.',
    icon: 'FaTrophy',
    points: parseInt(process.env.ACHIEVEMENT_POST_COUNT_2500_POINTS || '2500', 10),
  },
  POST_COUNT_5000: {
    key: 'POST_COUNT_5000',
    name: '명예의 전당',
    description: '게시글을 5,000개 작성했습니다.',
    icon: 'FaTrophy',
    points: parseInt(process.env.ACHIEVEMENT_POST_COUNT_5000_POINTS || '5000', 10),
  },
  POST_COUNT_10000: {
    key: 'POST_COUNT_10000',
    name: '사이트의 신',
    description: '게시글을 10,000개 작성했습니다.',
    icon: 'FaTrophy',
    points: parseInt(process.env.ACHIEVEMENT_POST_COUNT_10000_POINTS || '10000', 10),
  },
  FIRST_COMMENT: {
    key: 'FIRST_COMMENT',
    name: '첫 댓글 작성',
    description: '다른 사람의 글에 처음으로 댓글을 달아 소통을 시작했습니다.',
    icon: 'FaComment',
    points: parseInt(process.env.ACHIEVEMENT_FIRST_COMMENT_POINTS || '5', 10),
  },
  COMMENT_COUNT_10: {
    key: 'COMMENT_COUNT_10',
    name: '수다쟁이',
    description: '댓글을 10개 작성했습니다.',
    icon: 'FaComment',
    points: parseInt(process.env.ACHIEVEMENT_COMMENT_COUNT_10_POINTS || '10', 10),
  },
  COMMENT_COUNT_50: {
    key: 'COMMENT_COUNT_50',
    name: '커뮤니케이터',
    description: '댓글을 50개 작성했습니다.',
    icon: 'FaComments',
    points: parseInt(process.env.ACHIEVEMENT_COMMENT_COUNT_50_POINTS || '25', 10),
  },
  COMMENT_COUNT_100: {
    key: 'COMMENT_COUNT_100',
    name: '소통의 달인',
    description: '댓글을 100개 작성했습니다.',
    icon: 'FaComments',
    points: parseInt(process.env.ACHIEVEMENT_COMMENT_COUNT_100_POINTS || '50', 10),
  },
  COMMENT_COUNT_250: {
    key: 'COMMENT_COUNT_250',
    name: '프로 참견러',
    description: '댓글을 250개 작성했습니다.',
    icon: 'FaComments',
    points: parseInt(process.env.ACHIEVEMENT_COMMENT_COUNT_250_POINTS || '100', 10),
  },
  COMMENT_COUNT_500: {
    key: 'COMMENT_COUNT_500',
    name: '커뮤니티의 감초',
    description: '댓글을 500개 작성했습니다.',
    icon: 'FaTrophy',
    points: parseInt(process.env.ACHIEVEMENT_COMMENT_COUNT_500_POINTS || '250', 10),
  },
  COMMENT_COUNT_1000: {
    key: 'COMMENT_COUNT_1000',
    name: '만물박사',
    description: '댓글을 1,000개 작성했습니다.',
    icon: 'FaTrophy',
    points: parseInt(process.env.ACHIEVEMENT_COMMENT_COUNT_1000_POINTS || '500', 10),
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

  const achievement = await Achievement.findOneAndUpdate({ key: achievementKey }, achievementData, { upsert: true, new: true });

  if (!achievement) {
    console.error(`Could not find or create achievement for key: ${achievementKey}`);
    return null;
  }

  // Atomically grant the achievement and points if the user doesn't have it yet.
  const updatedUser = await User.findOneAndUpdate(
    { email: userEmail, 'achievements.achievement': { $ne: achievement._id } }, // Grant only if the user doesn't have it
    {
      $push: { achievements: { achievement: achievement._id, unlockedAt: new Date() } },
      $inc: { points: achievement.points }
    }
  );

  // If updatedUser is null, it means the user already had the achievement, or the user was not found.
  if (!updatedUser) {
    // This is expected if the achievement is already granted, so no error log is needed.
    return null;
  }

  console.log(`Achievement '${achievement.name}' (+${achievement.points}p) granted to ${userEmail}`);
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

/**
 * Checks and grants achievements based on the number of comments.
 * @param userEmail The email of the user.
 * @returns An array of newly unlocked achievements.
 */
export async function checkAndGrantCommentCountAchievements(userEmail: string): Promise<HydratedDocument<AchievementType>[]> {
  await connectToDB();

  const user = await User.findOne({ email: userEmail }).populate('achievements.achievement');
  
  if (!user) {
    console.error(`User not found: ${userEmail}`);
    return [];
  }

  const commentCount = await Comment.countDocuments({ authorId: user._id });

  const unlockedAchievements: HydratedDocument<AchievementType>[] = [];
  const userAchievementKeys = new Set(user.achievements.map((ach: PopulatedUserAchievement) => ach.achievement.key));

  const achievementChecks = [
    { key: 'FIRST_COMMENT', condition: commentCount >= 1 },
    { key: 'COMMENT_COUNT_10', condition: commentCount >= 10 },
    { key: 'COMMENT_COUNT_50', condition: commentCount >= 50 },
    { key: 'COMMENT_COUNT_100', condition: commentCount >= 100 },
    { key: 'COMMENT_COUNT_250', condition: commentCount >= 250 },
    { key: 'COMMENT_COUNT_500', condition: commentCount >= 500 },
    { key: 'COMMENT_COUNT_1000', condition: commentCount >= 1000 },
  ];

  for (const check of achievementChecks) {
    if (check.condition && !userAchievementKeys.has(check.key)) {
      const newAchievement = await grantAchievement(userEmail, check.key);
      if (newAchievement) unlockedAchievements.push(newAchievement);
    }
  }

  return unlockedAchievements;
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