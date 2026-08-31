/** 업적 공용 타입 (#333). definitions·rules·stats 가 서로 얽히지 않게 여기 모은다. */

/**
 * 등급 — 희소성을 눈에 보이게 한다.
 *   bronze  한 번 해 보면 얻는 것 (첫 글, 첫 완주)
 *   silver  꾸준해야 얻는 것 (100개, 7일 연속)
 *   gold    작정해야 얻는 것 (세트 완성, 1000개)
 */
export type Tier = 'bronze' | 'silver' | 'gold';

export type AchievementDefinition = {
  key: string;
  name: string;
  description: string;
  /** react-icons 이름. components/icons.tsx 의 achievementIconMap 에 있어야 한다. */
  icon: string;
  points: number;
  tier: Tier;
  /** 잠긴 동안 이름·설명을 감춘다. 우연히 발견하는 재미가 요점이라 API 가 서버에서 가린다. */
  hidden?: boolean;
};

/**
 * 판정에 필요한 모든 수치. **DB 를 한 번 훑어 여기 담고, 이후 판정은 순수하다.**
 * 새 업적을 추가할 때 여기 값이 이미 있으면 규칙 한 줄만 더하면 된다.
 */
export type AchievementStats = {
  postCount: number;
  commentCount: number;
  /** 한 글이 받은 최고치. 여러 글에 나눠 받은 것을 합치지 않는다 — 그건 개수 사다리가 센다. */
  maxPostLikes: number;
  maxPostViews: number;
  waRunCount: number;
  /** 본 엔딩 종류 (중복 없음) */
  waEndings: string[];
  /** 굴려 본 주인공 (중복 없음) */
  waProtagonists: string[];
  /** 오염도 0으로 완주한 적이 있는가 */
  waCleanRun: boolean;
  retroRomCount: number;
  retroSaveCount: number;
  /** 가입 후 지난 날 수 */
  memberDays: number;
  /** 가장 길었던 연속 글 작성 일수 (KST 날짜 기준) */
  postStreak: number;
  weekendPostCount: number;
  /** 새벽 0~5시(KST)에 쓴 글 수 */
  nightPostCount: number;
  /** 생일 당일에 접속한 적이 있는가 */
  birthdayVisit: boolean;
};

/** 업적 하나의 판정 결과. `current`/`target` 이 잠긴 업적 화면의 진행도가 된다. */
export type Evaluation = {
  key: string;
  unlocked: boolean;
  current: number;
  target: number;
};
