import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/achievement', () => ({ default: { findOneAndUpdate: vi.fn() } }));
vi.mock('@/models/user', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() } }));
vi.mock('./stats', () => ({ collectStats: vi.fn() }));

import { evaluateAndGrant, achievementView } from './grant';
import { collectStats } from './stats';
import Achievement from '@/models/achievement';
import User from '@/models/user';
import { emptyStats } from './rules';
import { ACHIEVEMENTS } from './definitions';
import type { AchievementStats } from './types';

const mockStats = collectStats as ReturnType<typeof vi.fn>;
const mockAchUpsert = Achievement.findOneAndUpdate as ReturnType<typeof vi.fn>;
const mockUserFindOne = User.findOne as ReturnType<typeof vi.fn>;
const mockUserUpdate = User.findOneAndUpdate as ReturnType<typeof vi.fn>;

const stats = (over: Partial<AchievementStats> = {}) => ({ ...emptyStats(), ...over });

/** 이미 가진 업적 키 목록을 가진 사용자를 흉내 낸다. */
function stubUser(ownedKeys: string[]) {
  mockUserFindOne.mockReturnValue({
    populate: vi.fn().mockResolvedValue({
      achievements: ownedKeys.map((key) => ({
        achievement: { key, _id: `id-${key}` },
        unlockedAt: new Date('2026-01-01'),
      })),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // upsert 는 정의를 그대로 돌려준다고 본다.
  mockAchUpsert.mockImplementation((filter: { key: string }) =>
    Promise.resolve({ ...ACHIEVEMENTS[filter.key], _id: `id-${filter.key}` }),
  );
  mockUserUpdate.mockResolvedValue({ email: 'me@test.com' });
});

describe('evaluateAndGrant', () => {
  it('새로 달성한 것만 부여한다', async () => {
    mockStats.mockResolvedValue(stats({ postCount: 10 }));
    stubUser(['FIRST_POST']);

    const granted = await evaluateAndGrant('me@test.com');

    expect(granted.map((g) => g.key)).toEqual(['POST_COUNT_10']);
  });

  it('이미 가진 것은 다시 주지 않는다 — 포인트가 두 번 오르면 안 된다', async () => {
    mockStats.mockResolvedValue(stats({ postCount: 10 }));
    stubUser(['FIRST_POST', 'POST_COUNT_10']);

    expect(await evaluateAndGrant('me@test.com')).toEqual([]);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it('과거 기록이 쌓여 있으면 한꺼번에 열린다 — 소급 부여', async () => {
    // 실제 사용자: 글 174 · 덧글 98 · 웹어드벤처 405 · 엔딩 6종 · 롬 16 · 세이브 7
    mockStats.mockResolvedValue(
      stats({
        postCount: 174,
        commentCount: 98,
        waRunCount: 405,
        waEndings: ['ascension', 'fall', 'harmony', 'petrification', 'revolution', 'sylvan_bond'],
        waProtagonists: ['kael', 'rin', 'solwen'],
        retroRomCount: 16,
        retroSaveCount: 7,
      }),
    );
    stubUser([]);

    const keys = (await evaluateAndGrant('me@test.com')).map((g) => g.key);

    expect(keys).toEqual(
      expect.arrayContaining([
        'POST_COUNT_100',
        'COMMENT_COUNT_50',
        'WA_RUN_100',
        'WA_ENDING_ALL',
        'WA_PROTAGONIST_ALL',
        'RETRO_ROM_10',
        'EXPLORER_ALL',
      ]),
    );
    expect(keys.length).toBeGreaterThan(15);
  });

  it('사용자를 못 찾으면 조용히 빈 배열', async () => {
    mockStats.mockResolvedValue(stats({ postCount: 10 }));
    mockUserFindOne.mockReturnValue({ populate: vi.fn().mockResolvedValue(null) });

    expect(await evaluateAndGrant('nobody@test.com')).toEqual([]);
  });

  it('오류가 나도 던지지 않는다 — 업적 때문에 글쓰기가 막히면 안 된다', async () => {
    mockStats.mockRejectedValue(new Error('mongo down'));

    expect(await evaluateAndGrant('me@test.com')).toEqual([]);
  });
});

describe('achievementView — 화면에 내려줄 형태', () => {
  it('달성·미달성을 갈라 준다', async () => {
    mockStats.mockResolvedValue(stats({ postCount: 10 }));
    stubUser(['FIRST_POST', 'POST_COUNT_10']);

    const view = await achievementView('me@test.com');

    expect(view.unlocked.map((a) => a.key)).toEqual(
      expect.arrayContaining(['FIRST_POST', 'POST_COUNT_10']),
    );
    expect(view.locked.map((a) => a.key)).toContain('POST_COUNT_50');
    expect(view.unlocked.map((a) => a.key)).not.toContain('POST_COUNT_50');
  });

  it('잠긴 항목에 진행도를 싣는다', async () => {
    mockStats.mockResolvedValue(stats({ postCount: 174 }));
    stubUser([]);

    const view = await achievementView('me@test.com');

    expect(view.locked.find((a) => a.key === 'POST_COUNT_250')).toMatchObject({
      current: 174,
      target: 250,
    });
  });

  it('숨김 업적은 잠겨 있으면 이름·설명을 가린다 — 서버에서 가려야 devtools 로 안 보인다', async () => {
    mockStats.mockResolvedValue(stats());
    stubUser([]);

    const view = await achievementView('me@test.com');
    const hidden = view.locked.find((a) => a.key === 'NIGHT_OWL');

    expect(hidden?.name).toBe('???');
    expect(hidden?.description).toBe('');
    expect(hidden?.hidden).toBe(true);
  });

  it('숨김 업적도 달성하면 제대로 보인다', async () => {
    mockStats.mockResolvedValue(stats({ nightPostCount: 1 }));
    stubUser(['NIGHT_OWL']);

    const view = await achievementView('me@test.com');

    expect(view.unlocked.find((a) => a.key === 'NIGHT_OWL')?.name).toBe(ACHIEVEMENTS.NIGHT_OWL.name);
  });

  it('등급을 실어 보낸다 — 화면이 색을 나눌 때 쓴다', async () => {
    mockStats.mockResolvedValue(stats());
    stubUser([]);

    const view = await achievementView('me@test.com');

    expect(view.locked.find((a) => a.key === 'POST_COUNT_1000')?.tier).toBe('gold');
  });

  it('보기 전에 재평가해 소급 부여가 일어난다', async () => {
    mockStats.mockResolvedValue(stats({ postCount: 174 }));
    stubUser([]);

    await achievementView('me@test.com');

    // 프로필을 여는 것만으로 밀린 업적이 부여된다.
    expect(mockUserUpdate).toHaveBeenCalled();
  });
});
