import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/lib/env', () => ({
  env: {
    achievements: {
      firstPost: 10, postCount10: 20, postCount50: 50, postCount100: 100,
      postCount250: 250, postCount500: 500, postCount1000: 1000,
      postCount2500: 2500, postCount5000: 5000, postCount10000: 10000,
      post10Likes: 30,
      firstComment: 10, commentCount10: 20, commentCount50: 50,
      commentCount100: 100, commentCount250: 250, commentCount500: 500,
      commentCount1000: 1000,
    },
  },
}));

vi.mock('@/models/achievement', () => ({
  default: { findOneAndUpdate: vi.fn() },
}));
vi.mock('@/models/post', () => ({
  default: { countDocuments: vi.fn(), findById: vi.fn() },
}));
vi.mock('@/models/comment', () => ({
  default: { countDocuments: vi.fn() },
}));
vi.mock('@/models/user', () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
}));

import Achievement from '@/models/achievement';
import Post from '@/models/post';
import Comment from '@/models/comment';
import User from '@/models/user';
import {
  checkAndGrantPostCountAchievements,
  checkAndGrantCommentCountAchievements,
  checkAndGrantPostInteractionAchievements,
} from './achievements';

// User.findOne(...).populate(...) 패턴을 지원하는 mock Query 객체
function mockUserFindOne(user: object | null) {
  (User.findOne as Mock).mockReturnValue({
    populate: vi.fn().mockResolvedValue(user),
  });
}

function makeUser(achievementKeys: string[] = []) {
  return {
    _id: 'user1',
    email: 'test@test.com',
    achievements: achievementKeys.map(k => ({ achievement: { key: k } })),
  };
}

const mockAchievement = (key: string) => ({ _id: `ach_${key}`, key, name: key, points: 10 });

// grantAchievement 내부: Achievement.findOneAndUpdate → achievement 반환,
// User.findOneAndUpdate → updatedUser 반환 (null이면 이미 보유)
function setupGrantSuccess(key: string) {
  (Achievement.findOneAndUpdate as Mock).mockResolvedValue(mockAchievement(key));
  (User.findOneAndUpdate as Mock).mockResolvedValue({ email: 'test@test.com' });
}

function setupGrantMultiple(keys: string[]) {
  keys.forEach(key => {
    (Achievement.findOneAndUpdate as Mock).mockResolvedValueOnce(mockAchievement(key));
  });
  (User.findOneAndUpdate as Mock).mockResolvedValue({ email: 'test@test.com' });
}

describe('checkAndGrantPostCountAchievements', () => {
  beforeEach(() => vi.clearAllMocks());

  it('사용자를 찾지 못하면 빈 배열을 반환한다', async () => {
    (Post.countDocuments as Mock).mockResolvedValue(5);
    mockUserFindOne(null);
    const result = await checkAndGrantPostCountAchievements('none@test.com');
    expect(result).toEqual([]);
  });

  it('postCount=0이면 아무 업적도 부여하지 않는다', async () => {
    (Post.countDocuments as Mock).mockResolvedValue(0);
    mockUserFindOne(makeUser());
    const result = await checkAndGrantPostCountAchievements('test@test.com');
    expect(result).toEqual([]);
    expect(Achievement.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('postCount=1이면 FIRST_POST 업적을 부여한다', async () => {
    (Post.countDocuments as Mock).mockResolvedValue(1);
    mockUserFindOne(makeUser());
    setupGrantSuccess('FIRST_POST');
    const result = await checkAndGrantPostCountAchievements('test@test.com');
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('FIRST_POST');
  });

  it('postCount=10이면 FIRST_POST와 POST_COUNT_10을 부여한다', async () => {
    (Post.countDocuments as Mock).mockResolvedValue(10);
    mockUserFindOne(makeUser());
    setupGrantMultiple(['FIRST_POST', 'POST_COUNT_10']);
    const result = await checkAndGrantPostCountAchievements('test@test.com');
    expect(result).toHaveLength(2);
    expect(result.map(a => a.key)).toEqual(['FIRST_POST', 'POST_COUNT_10']);
  });

  it('postCount=50이면 조건을 만족하는 3개 업적을 모두 부여한다', async () => {
    (Post.countDocuments as Mock).mockResolvedValue(50);
    mockUserFindOne(makeUser());
    setupGrantMultiple(['FIRST_POST', 'POST_COUNT_10', 'POST_COUNT_50']);
    const result = await checkAndGrantPostCountAchievements('test@test.com');
    expect(result).toHaveLength(3);
  });

  it('이미 보유한 업적은 다시 부여하지 않는다', async () => {
    (Post.countDocuments as Mock).mockResolvedValue(1);
    mockUserFindOne(makeUser(['FIRST_POST']));
    const result = await checkAndGrantPostCountAchievements('test@test.com');
    expect(result).toEqual([]);
    expect(Achievement.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('checkAndGrantCommentCountAchievements', () => {
  beforeEach(() => vi.clearAllMocks());

  it('사용자를 찾지 못하면 빈 배열을 반환한다', async () => {
    mockUserFindOne(null);
    const result = await checkAndGrantCommentCountAchievements('none@test.com');
    expect(result).toEqual([]);
  });

  it('commentCount=0이면 아무 업적도 부여하지 않는다', async () => {
    mockUserFindOne(makeUser());
    (Comment.countDocuments as Mock).mockResolvedValue(0);
    const result = await checkAndGrantCommentCountAchievements('test@test.com');
    expect(result).toEqual([]);
  });

  it('commentCount=1이면 FIRST_COMMENT를 부여한다', async () => {
    mockUserFindOne(makeUser());
    (Comment.countDocuments as Mock).mockResolvedValue(1);
    setupGrantSuccess('FIRST_COMMENT');
    const result = await checkAndGrantCommentCountAchievements('test@test.com');
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('FIRST_COMMENT');
  });

  it('commentCount=10이면 FIRST_COMMENT와 COMMENT_COUNT_10을 부여한다', async () => {
    mockUserFindOne(makeUser());
    (Comment.countDocuments as Mock).mockResolvedValue(10);
    setupGrantMultiple(['FIRST_COMMENT', 'COMMENT_COUNT_10']);
    const result = await checkAndGrantCommentCountAchievements('test@test.com');
    expect(result).toHaveLength(2);
    expect(result.map(a => a.key)).toEqual(['FIRST_COMMENT', 'COMMENT_COUNT_10']);
  });

  it('이미 보유한 업적은 다시 부여하지 않는다', async () => {
    mockUserFindOne(makeUser(['FIRST_COMMENT']));
    (Comment.countDocuments as Mock).mockResolvedValue(1);
    const result = await checkAndGrantCommentCountAchievements('test@test.com');
    expect(result).toEqual([]);
  });
});

describe('checkAndGrantPostInteractionAchievements', () => {
  beforeEach(() => vi.clearAllMocks());

  it('게시글을 찾지 못하면 빈 배열을 반환한다', async () => {
    (Post.findById as Mock).mockResolvedValue(null);
    const result = await checkAndGrantPostInteractionAchievements('invalid_id');
    expect(result).toEqual([]);
  });

  it('likes < 10이면 업적을 부여하지 않는다', async () => {
    (Post.findById as Mock).mockResolvedValue({ likes: 9, userEmail: 'test@test.com' });
    mockUserFindOne(makeUser());
    const result = await checkAndGrantPostInteractionAchievements('post1');
    expect(result).toEqual([]);
    expect(Achievement.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('likes >= 10이면 POST_10_LIKES를 부여한다', async () => {
    (Post.findById as Mock).mockResolvedValue({ likes: 10, userEmail: 'test@test.com' });
    mockUserFindOne(makeUser());
    setupGrantSuccess('POST_10_LIKES');
    const result = await checkAndGrantPostInteractionAchievements('post1');
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('POST_10_LIKES');
  });

  it('이미 POST_10_LIKES를 보유하면 다시 부여하지 않는다', async () => {
    (Post.findById as Mock).mockResolvedValue({ likes: 10, userEmail: 'test@test.com' });
    mockUserFindOne(makeUser(['POST_10_LIKES']));
    const result = await checkAndGrantPostInteractionAchievements('post1');
    expect(result).toEqual([]);
  });

  it('게시글 작성자를 찾지 못하면 빈 배열을 반환한다', async () => {
    (Post.findById as Mock).mockResolvedValue({ likes: 10, userEmail: 'ghost@test.com' });
    mockUserFindOne(null);
    const result = await checkAndGrantPostInteractionAchievements('post1');
    expect(result).toEqual([]);
  });
});
