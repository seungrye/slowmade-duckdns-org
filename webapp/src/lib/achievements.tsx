import { HydratedDocument } from "mongoose";
import { connectToDB } from "./db";
import Achievement from "@/models/achievement";
import User from "@/models/user";
import Post from "@/models/post";
import { UserAchievementType } from "@/types/achievements.d";
import { AchievementType } from "@/models/achievement";
import Comment from "@/models/comment";
import { env } from "./env";
 
// populate 이후의 하위 문서(subdocument) 유형으로, 여러 함수에서 공통으로 사용됩니다.
type PopulatedUserAchievement = {
  achievement: HydratedDocument<AchievementType>;
  unlockedAt: Date;
};

// 업적의 기본 구조를 정의하는 타입입니다.
type AchievementDefinition = {
  key: string;
  name: string;
  description: string;
  icon: string;
  points: number;
};

// 사전 정의된 모든 업적의 목록입니다.
export const ACHIEVEMENTS: { [key: string]: AchievementDefinition } = {
  FIRST_POST: {
    key: 'FIRST_POST',
    name: '첫 글 작성',
    description: '첫 번째 유머 글을 작성하여 커뮤니티에 기여했습니다.',
    icon: 'FaPencilAlt',
    points: env.achievements.firstPost,
  },
  POST_COUNT_10: {
    key: 'POST_COUNT_10',
    name: '성실한 작가',
    description: '게시글을 10개 작성했습니다.',
    icon: 'FaPencilAlt',
    points: env.achievements.postCount10,
  },
  POST_COUNT_50: {
    key: 'POST_COUNT_50',
    name: '열정적인 작가',
    description: '게시글을 50개 작성했습니다.',
    icon: 'FaAward',
    points: env.achievements.postCount50,
  },
  POST_COUNT_100: {
    key: 'POST_COUNT_100',
    name: '꾸준한 작가',
    description: '게시글을 100개 작성했습니다.',
    icon: 'FaAward',
    points: env.achievements.postCount100,
  },
  POST_COUNT_250: {
    key: 'POST_COUNT_250',
    name: '성실한 기고가',
    description: '게시글을 250개 작성했습니다.',
    icon: 'FaAward',
    points: env.achievements.postCount250,
  },
  POST_COUNT_500: {
    key: 'POST_COUNT_500',
    name: '커뮤니티의 기둥',
    description: '게시글을 500개 작성했습니다.',
    icon: 'FaTrophy',
    points: env.achievements.postCount500,
  },
  POST_COUNT_1000: {
    key: 'POST_COUNT_1000',
    name: '지식의 대가',
    description: '게시글을 1,000개 작성했습니다.',
    icon: 'FaTrophy',
    points: env.achievements.postCount1000,
  },
  POST_COUNT_2500: {
    key: 'POST_COUNT_2500',
    name: '살아있는 전설',
    description: '게시글을 2,500개 작성했습니다.',
    icon: 'FaTrophy',
    points: env.achievements.postCount2500,
  },
  POST_COUNT_5000: {
    key: 'POST_COUNT_5000',
    name: '명예의 전당',
    description: '게시글을 5,000개 작성했습니다.',
    icon: 'FaTrophy',
    points: env.achievements.postCount5000,
  },
  POST_COUNT_10000: {
    key: 'POST_COUNT_10000',
    name: '사이트의 신',
    description: '게시글을 10,000개 작성했습니다.',
    icon: 'FaTrophy',
    points: env.achievements.postCount10000,
  },
  POST_10_LIKES: {
    key: 'POST_10_LIKES',
    name: '인기 게시글',
    description: '게시글 하나가 추천을 10개 이상 받았습니다.',
    icon: 'FaHeart',
    points: env.achievements.post10Likes,
  },
  FIRST_COMMENT: {
    key: 'FIRST_COMMENT',
    name: '첫 댓글 작성',
    description: '다른 사람의 글에 처음으로 댓글을 달아 소통을 시작했습니다.',
    icon: 'FaComment',
    points: env.achievements.firstComment,
  },
  COMMENT_COUNT_10: {
    key: 'COMMENT_COUNT_10',
    name: '수다쟁이',
    description: '댓글을 10개 작성했습니다.',
    icon: 'FaComment',
    points: env.achievements.commentCount10,
  },
  COMMENT_COUNT_50: {
    key: 'COMMENT_COUNT_50',
    name: '커뮤니케이터',
    description: '댓글을 50개 작성했습니다.',
    icon: 'FaComments',
    points: env.achievements.commentCount50,
  },
  COMMENT_COUNT_100: {
    key: 'COMMENT_COUNT_100',
    name: '소통의 달인',
    description: '댓글을 100개 작성했습니다.',
    icon: 'FaComments',
    points: env.achievements.commentCount100,
  },
  COMMENT_COUNT_250: {
    key: 'COMMENT_COUNT_250',
    name: '프로 참견러',
    description: '댓글을 250개 작성했습니다.',
    icon: 'FaComments',
    points: env.achievements.commentCount250,
  },
  COMMENT_COUNT_500: {
    key: 'COMMENT_COUNT_500',
    name: '커뮤니티의 감초',
    description: '댓글을 500개 작성했습니다.',
    icon: 'FaTrophy',
    points: env.achievements.commentCount500,
  },
  COMMENT_COUNT_1000: {
    key: 'COMMENT_COUNT_1000',
    name: '만물박사',
    description: '댓글을 1,000개 작성했습니다.',
    icon: 'FaTrophy',
    points: env.achievements.commentCount1000,
  },
};

// 특정 사용자에게 업적을 부여하는 함수입니다.
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

  // 사용자가 아직 해당 업적을 가지고 있지 않은 경우에만, 원자적(atomic)으로 업적과 포인트를 부여합니다.
  const updatedUser = await User.findOneAndUpdate(
    { email: userEmail, 'achievements.achievement': { $ne: achievement._id } }, // 사용자가 아직 없는 업적일 경우에만 부여
    {
      $push: { achievements: { achievement: achievement._id, unlockedAt: new Date() } },
      $inc: { points: achievement.points }
    }
  );

  // updatedUser가 null이면, 사용자를 찾지 못했거나 이미 해당 업적을 가지고 있다는 의미입니다.
  if (!updatedUser) {
    // 이미 업적이 부여된 경우는 정상적인 상황이므로, 별도의 오류 로그를 남기지 않습니다.
    return null;
  }

  console.log(`Achievement '${achievement.name}' (+${achievement.points}p) granted to ${userEmail}`);
  return achievement;
}

/**
 * 게시글 수를 기반으로 업적을 확인하고 부여합니다.
 * @param userEmail 사용자 이메일
 * @returns 새로 잠금 해제된 업적의 배열
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
 * 댓글 수를 기반으로 업적을 확인하고 부여합니다.
 * @param userEmail 사용자 이메일
 * @returns 새로 잠금 해제된 업적의 배열
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

/**
 * 게시글의 상호작용(예: 추천)과 관련된 업적을 확인하고 부여합니다.
 * 이 함수는 게시글이 추천과 같은 새로운 상호작용을 받았을 때 호출되어야 합니다.
 * @param postId 상호작용을 받은 게시글의 ID
 * @returns 게시글 작성자가 새로 잠금 해제한 업적의 배열
 */
export async function checkAndGrantPostInteractionAchievements(postId: string): Promise<HydratedDocument<AchievementType>[]> {
  await connectToDB();

  const post = await Post.findById(postId);
  if (!post) {
    console.error(`Post not found for interaction check: ${postId}`);
    return [];
  }

  // 업적은 게시글 작성자에게 주어지므로, 본인이 추천했는지 여부를 확인할 필요는 없습니다.
  const user = await User.findOne({ email: post.userEmail }).populate('achievements.achievement');
  if (!user) {
    console.error(`User not found for post author: ${post.userEmail}`);
    return [];
  }

  const unlockedAchievements: HydratedDocument<AchievementType>[] = [];
  const userAchievementKeys = new Set(user.achievements.map((ach: PopulatedUserAchievement) => ach.achievement.key));

  // --- 업적 확인: 추천 10개 이상 받은 게시글 ---
  if (post.likes >= 10 && !userAchievementKeys.has('POST_10_LIKES')) {
    const newAchievement = await grantAchievement(user.email, 'POST_10_LIKES');
    if (newAchievement) unlockedAchievements.push(newAchievement);
  }

  // --- 이 게시글과 관련된 다른 업적 확인 로직을 여기에 추가할 수 있습니다 ---
  // 예: 특정 게시글의 댓글 수 확인 등

  return unlockedAchievements;
}

// 특정 사용자가 획득한 모든 업적 목록을 가져옵니다.
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