import { describe, it, expect } from 'vitest';
import { evaluate, emptyStats, ENDING_IDS, PROTAGONISTS } from './rules';
import { ACHIEVEMENTS } from './definitions';
import type { AchievementStats } from './types';
import { achievementIconMap } from '@/components/icons';

const stats = (over: Partial<AchievementStats> = {}): AchievementStats => ({ ...emptyStats(), ...over });
const byKey = (s: AchievementStats) => Object.fromEntries(evaluate(s).map((e) => [e.key, e]));
const unlockedKeys = (s: AchievementStats) => evaluate(s).filter((e) => e.unlocked).map((e) => e.key);

describe('evaluate — 뼈대', () => {
  it('모든 업적을 빠짐없이 판정한다', () => {
    const keys = evaluate(emptyStats()).map((e) => e.key).sort();
    expect(keys).toEqual(Object.keys(ACHIEVEMENTS).sort());
  });

  it('아무것도 안 한 사람은 하나도 못 얻는다', () => {
    expect(unlockedKeys(emptyStats())).toEqual([]);
  });

  it('진행도를 함께 낸다 — 잠긴 업적 화면이 이걸 쓴다', () => {
    const e = byKey(stats({ postCount: 174 }))['POST_COUNT_250'];
    expect(e).toMatchObject({ current: 174, target: 250, unlocked: false });
  });

  it('목표를 넘어도 진행도는 목표에서 멈춘다 — 174/250 은 되고 300/250 은 안 된다', () => {
    const e = byKey(stats({ postCount: 300 }))['POST_COUNT_250'];
    expect(e).toMatchObject({ current: 250, target: 250, unlocked: true });
  });
});

describe('개수 사다리', () => {
  it.each([
    [1, ['FIRST_POST']],
    [9, ['FIRST_POST']],
    [10, ['FIRST_POST', 'POST_COUNT_10']],
  ])('글 %i개면 %j', (postCount, expected) => {
    expect(unlockedKeys(stats({ postCount })).filter((k) => k.startsWith('FIRST_POST') || k.startsWith('POST_COUNT'))).toEqual(expected);
  });

  it('도달 불가 사다리는 없앴다', () => {
    for (const key of ['POST_COUNT_2500', 'POST_COUNT_5000', 'POST_COUNT_10000']) {
      expect(ACHIEVEMENTS[key], key).toBeUndefined();
    }
    expect(ACHIEVEMENTS['POST_COUNT_1000']).toBeDefined();
  });

  it('덧글도 같은 방식', () => {
    expect(unlockedKeys(stats({ commentCount: 98 }))).toEqual(
      expect.arrayContaining(['FIRST_COMMENT', 'COMMENT_COUNT_10', 'COMMENT_COUNT_50']),
    );
    expect(unlockedKeys(stats({ commentCount: 98 }))).not.toContain('COMMENT_COUNT_100');
  });
});

describe('글 품질', () => {
  it('한 글의 최고 좋아요로 판정한다 — 여러 글에 나눠 받은 건 합치지 않는다', () => {
    expect(unlockedKeys(stats({ maxPostLikes: 10 }))).toContain('POST_10_LIKES');
    expect(unlockedKeys(stats({ maxPostLikes: 9 }))).not.toContain('POST_10_LIKES');
    expect(unlockedKeys(stats({ maxPostLikes: 50 }))).toContain('POST_50_LIKES');
  });

  it('조회수도 최고 글 기준', () => {
    expect(unlockedKeys(stats({ maxPostViews: 1000 }))).toEqual(
      expect.arrayContaining(['POST_100_VIEWS', 'POST_1000_VIEWS']),
    );
  });
});

describe('웹어드벤처', () => {
  it('완주 횟수 사다리', () => {
    expect(unlockedKeys(stats({ waRunCount: 405 }))).toEqual(
      expect.arrayContaining(['WA_FIRST_RUN', 'WA_RUN_10', 'WA_RUN_50', 'WA_RUN_100']),
    );
  });

  describe('수집형 — 세트를 다 채워야 열린다', () => {
    it('엔딩은 6종을 다 봐야 한다', () => {
      const five = stats({ waEndings: ENDING_IDS.slice(0, 5) });
      expect(unlockedKeys(five)).toContain('WA_ENDING_3');
      expect(unlockedKeys(five)).not.toContain('WA_ENDING_ALL');

      expect(unlockedKeys(stats({ waEndings: [...ENDING_IDS] }))).toContain('WA_ENDING_ALL');
    });

    it('엔딩 진행도는 본 개수 / 전체', () => {
      const e = byKey(stats({ waEndings: ENDING_IDS.slice(0, 4) }))['WA_ENDING_ALL'];
      expect(e).toMatchObject({ current: 4, target: 6 });
    });

    it('주인공 3명을 다 굴려야 한다', () => {
      expect(unlockedKeys(stats({ waProtagonists: PROTAGONISTS.slice(0, 2) }))).not.toContain('WA_PROTAGONIST_ALL');
      expect(unlockedKeys(stats({ waProtagonists: [...PROTAGONISTS] }))).toContain('WA_PROTAGONIST_ALL');
    });
  });

  it('오염도 0 완주는 숨김 업적이다', () => {
    expect(ACHIEVEMENTS['WA_CLEAN_RUN'].hidden).toBe(true);
    expect(unlockedKeys(stats({ waCleanRun: true }))).toContain('WA_CLEAN_RUN');
  });
});

describe('레트로', () => {
  it('롬과 세이브를 따로 센다', () => {
    expect(unlockedKeys(stats({ retroRomCount: 16, retroSaveCount: 7 }))).toEqual(
      expect.arrayContaining(['RETRO_FIRST_ROM', 'RETRO_ROM_10', 'RETRO_FIRST_SAVE']),
    );
    expect(unlockedKeys(stats({ retroRomCount: 16, retroSaveCount: 7 }))).not.toContain('RETRO_SAVE_10');
  });
});

describe('시간·습관', () => {
  it('가입 1주년·2주년', () => {
    expect(unlockedKeys(stats({ memberDays: 364 }))).not.toContain('ANNIVERSARY_1');
    expect(unlockedKeys(stats({ memberDays: 365 }))).toContain('ANNIVERSARY_1');
    expect(unlockedKeys(stats({ memberDays: 730 }))).toContain('ANNIVERSARY_2');
  });

  it('7일 연속 글쓰기', () => {
    expect(unlockedKeys(stats({ postStreak: 6 }))).not.toContain('STREAK_7');
    expect(unlockedKeys(stats({ postStreak: 7 }))).toContain('STREAK_7');
  });

  it('주말 글 10개', () => {
    expect(unlockedKeys(stats({ weekendPostCount: 10 }))).toContain('WEEKEND_WRITER');
  });

  it('새벽 글과 생일 접속은 숨김', () => {
    expect(ACHIEVEMENTS['NIGHT_OWL'].hidden).toBe(true);
    expect(ACHIEVEMENTS['BIRTHDAY_VISIT'].hidden).toBe(true);
    expect(unlockedKeys(stats({ nightPostCount: 1 }))).toContain('NIGHT_OWL');
    expect(unlockedKeys(stats({ birthdayVisit: true }))).toContain('BIRTHDAY_VISIT');
  });
});

describe('탐험 — 서로 다른 기능을 써 봤는가', () => {
  const used = (over: Partial<AchievementStats>) => unlockedKeys(stats(over));

  it('글만 써서는 안 열린다', () => {
    expect(used({ postCount: 174 })).not.toContain('EXPLORER_3');
  });

  it('서로 다른 기능 3가지를 쓰면 열린다', () => {
    expect(used({ postCount: 1, commentCount: 1, waRunCount: 1 })).toContain('EXPLORER_3');
  });

  it('넷을 다 써야 완주 업적이 열린다', () => {
    expect(used({ postCount: 1, commentCount: 1, waRunCount: 1 })).not.toContain('EXPLORER_ALL');
    expect(used({ postCount: 1, commentCount: 1, waRunCount: 1, retroSaveCount: 1 })).toContain('EXPLORER_ALL');
  });

  it('레트로는 롬이든 세이브든 하나면 쓴 것으로 친다', () => {
    expect(used({ postCount: 1, commentCount: 1, waRunCount: 1, retroRomCount: 1 })).toContain('EXPLORER_ALL');
  });
});

describe('정의 자체 점검', () => {
  const entries = Object.entries(ACHIEVEMENTS);

  it('key 가 표의 키와 같다', () => {
    for (const [key, def] of entries) expect(def.key, key).toBe(key);
  });

  it('이름·설명·아이콘·등급이 다 있다', () => {
    for (const [key, def] of entries) {
      expect(def.name, key).toBeTruthy();
      expect(def.description.length, key).toBeGreaterThan(5);
      expect(def.icon, key).toBeTruthy();
      expect(['bronze', 'silver', 'gold'], key).toContain(def.tier);
      expect(def.points, key).toBeGreaterThan(0);
    }
  });

  it('결이 골고루 섞여 있다 — 등급이 한쪽으로 쏠리면 희소성이 없다', () => {
    const tiers = entries.map(([, d]) => d.tier);
    for (const tier of ['bronze', 'silver', 'gold']) {
      expect(tiers.filter((t) => t === tier).length, tier).toBeGreaterThanOrEqual(5);
    }
  });

  it('아이콘이 모두 맵에 있다 — 없으면 화면에 기본 아이콘만 나온다', () => {
    for (const [key, def] of entries) {
      expect(achievementIconMap[def.icon], `${key} 의 ${def.icon}`).toBeDefined();
    }
  });

  it('숨김 업적이 몇 개는 있다', () => {
    expect(entries.filter(([, d]) => d.hidden).length).toBeGreaterThanOrEqual(3);
  });
});
