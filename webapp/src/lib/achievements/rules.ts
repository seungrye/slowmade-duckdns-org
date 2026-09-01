import { ACHIEVEMENTS } from './definitions';
import type { AchievementStats, Evaluation } from './types';

/**
 * 업적 판정 (#333) — **순수**. DB·시계·네트워크를 모른다.
 *
 * 규칙 하나가 표의 한 줄이다. `value` 가 지금 수치를, `target` 이 목표를 낸다. 그래서
 *
 *   - 해금 여부(`current >= target`)와
 *   - 잠긴 화면의 진행도(`174/250`)를
 *
 * **한 곳에서** 얻는다. 예전처럼 조건식을 따로 두면 진행도를 또 계산해야 하고 둘이 어긋난다.
 *
 * 새 업적을 넣으려면 `definitions.ts` 에 한 줄, 여기에 한 줄이면 끝이다.
 */

/**
 * 웹어드벤처 엔딩 — 수집형 업적의 분모. 목록은 types 가 원본이다 (#352).
 *
 * 예전엔 여기에 6종을 손으로 적어 뒀다. 엔딩이 11종이 된 뒤에도 이 값이 6이라
 * 「모든 엔딩」 업적이 실제보다 일찍 열렸다. 다시 어긋나지 않게 다시 내보내기만 한다.
 */
export { ENDING_IDS } from '@/types/web-adventure';
import { ENDING_IDS } from '@/types/web-adventure';

/** 주인공 (실측 2026: 3명). */
export const PROTAGONISTS = ['kael', 'rin', 'solwen'] as const;

/** 판정에 쓰는 전부 0/빈 상태. 테스트와 신규 사용자의 출발점. */
export function emptyStats(): AchievementStats {
  return {
    postCount: 0,
    commentCount: 0,
    maxPostLikes: 0,
    maxPostViews: 0,
    waRunCount: 0,
    waEndings: [],
    waProtagonists: [],
    waCleanRun: false,
    retroRomCount: 0,
    retroSaveCount: 0,
    memberDays: 0,
    postStreak: 0,
    weekendPostCount: 0,
    nightPostCount: 0,
    birthdayVisit: false,
  };
}

const yes = (b: boolean) => (b ? 1 : 0);

/** 서로 다른 기능을 몇 가지나 써 봤나. 레트로는 롬이든 세이브든 하나면 쓴 것으로 친다. */
function featuresUsed(s: AchievementStats): number {
  return [
    s.postCount > 0,
    s.commentCount > 0,
    s.waRunCount > 0,
    s.retroRomCount > 0 || s.retroSaveCount > 0,
  ].filter(Boolean).length;
}

const FEATURE_COUNT = 4;

type Rule = { key: string; target: number; value: (s: AchievementStats) => number };

const RULES: Rule[] = [
  // 글
  { key: 'FIRST_POST', target: 1, value: (s) => s.postCount },
  { key: 'POST_COUNT_10', target: 10, value: (s) => s.postCount },
  { key: 'POST_COUNT_50', target: 50, value: (s) => s.postCount },
  { key: 'POST_COUNT_100', target: 100, value: (s) => s.postCount },
  { key: 'POST_COUNT_250', target: 250, value: (s) => s.postCount },
  { key: 'POST_COUNT_500', target: 500, value: (s) => s.postCount },
  { key: 'POST_COUNT_1000', target: 1000, value: (s) => s.postCount },

  // 덧글
  { key: 'FIRST_COMMENT', target: 1, value: (s) => s.commentCount },
  { key: 'COMMENT_COUNT_10', target: 10, value: (s) => s.commentCount },
  { key: 'COMMENT_COUNT_50', target: 50, value: (s) => s.commentCount },
  { key: 'COMMENT_COUNT_100', target: 100, value: (s) => s.commentCount },
  { key: 'COMMENT_COUNT_250', target: 250, value: (s) => s.commentCount },
  { key: 'COMMENT_COUNT_500', target: 500, value: (s) => s.commentCount },
  { key: 'COMMENT_COUNT_1000', target: 1000, value: (s) => s.commentCount },

  // 글이 닿은 정도 — 한 글의 최고치로 본다(여러 글에 나눠 받은 건 개수 사다리가 센다)
  { key: 'POST_10_LIKES', target: 10, value: (s) => s.maxPostLikes },
  { key: 'POST_50_LIKES', target: 50, value: (s) => s.maxPostLikes },
  { key: 'POST_100_VIEWS', target: 100, value: (s) => s.maxPostViews },
  { key: 'POST_1000_VIEWS', target: 1000, value: (s) => s.maxPostViews },

  // 웹어드벤처
  { key: 'WA_FIRST_RUN', target: 1, value: (s) => s.waRunCount },
  { key: 'WA_RUN_10', target: 10, value: (s) => s.waRunCount },
  { key: 'WA_RUN_50', target: 50, value: (s) => s.waRunCount },
  { key: 'WA_RUN_100', target: 100, value: (s) => s.waRunCount },
  { key: 'WA_ENDING_3', target: 3, value: (s) => s.waEndings.length },
  { key: 'WA_ENDING_ALL', target: ENDING_IDS.length, value: (s) => s.waEndings.length },
  { key: 'WA_PROTAGONIST_ALL', target: PROTAGONISTS.length, value: (s) => s.waProtagonists.length },
  { key: 'WA_CLEAN_RUN', target: 1, value: (s) => yes(s.waCleanRun) },

  // 레트로
  { key: 'RETRO_FIRST_ROM', target: 1, value: (s) => s.retroRomCount },
  { key: 'RETRO_ROM_10', target: 10, value: (s) => s.retroRomCount },
  { key: 'RETRO_FIRST_SAVE', target: 1, value: (s) => s.retroSaveCount },
  { key: 'RETRO_SAVE_10', target: 10, value: (s) => s.retroSaveCount },

  // 함께한 시간
  { key: 'ANNIVERSARY_1', target: 365, value: (s) => s.memberDays },
  { key: 'ANNIVERSARY_2', target: 730, value: (s) => s.memberDays },

  // 리듬
  { key: 'STREAK_7', target: 7, value: (s) => s.postStreak },
  { key: 'WEEKEND_WRITER', target: 10, value: (s) => s.weekendPostCount },

  // 탐험
  { key: 'EXPLORER_3', target: 3, value: featuresUsed },
  { key: 'EXPLORER_ALL', target: FEATURE_COUNT, value: featuresUsed },

  // 숨김
  { key: 'NIGHT_OWL', target: 1, value: (s) => s.nightPostCount },
  { key: 'BIRTHDAY_VISIT', target: 1, value: (s) => yes(s.birthdayVisit) },
];

export function evaluate(stats: AchievementStats): Evaluation[] {
  return RULES.map(({ key, target, value }) => {
    const raw = value(stats);
    return {
      key,
      unlocked: raw >= target,
      // 진행도는 목표에서 멈춘다 — 300/250 은 화면에서 이상하게 보인다.
      current: Math.min(raw, target),
      target,
    };
  });
}

/** 표와 규칙이 어긋나면(한쪽에만 있는 키) 바로 알 수 있게 둔다. 테스트가 이걸 확인한다. */
export const RULE_KEYS = RULES.map((r) => r.key);
export const DEFINITION_KEYS = Object.keys(ACHIEVEMENTS);
