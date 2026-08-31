import type { AchievementDefinition } from './types';

/**
 * 업적 표 (#333) — **순수 데이터**. DB·네트워크를 모른다.
 *
 * ── 왜 개수 사다리만으로는 안 되나 ────────────────────────────────────
 *
 * 개편 전엔 18개가 전부 "글 N개·덧글 N개"였다. 그러면 많이 쓰는 사람만 보상받고, **무엇을
 * 해 볼지는 알려주지 못한다.** 실제로 웹어드벤처를 405번 플레이했는데 업적이 하나도 없었다.
 *
 * 그래서 결을 섞는다:
 *
 *   개수   꾸준함을 센다 (글·덧글·완주 횟수)
 *   품질   한 편이 얼마나 닿았나 (좋아요·조회)
 *   수집   세트를 채운다 (엔딩 6종·주인공 3종) — 다 채워야 열리는 게 요점
 *   시간   함께한 시간 (1·2주년)
 *   습관   리듬 (7일 연속·주말)
 *   탐험   기능을 얼마나 둘러봤나
 *   숨김   우연히 발견하는 것 (새벽 글·무결점 완주·생일 접속)
 *
 * 포인트는 여기 직접 적는다. 예전엔 `ACHIEVEMENT_*_POINTS` env 18개였는데 값이 전부
 * 기본값과 같아 실질적으로 안 쓰이는 설정이었고, 업적을 40개로 늘리면 env 도 40개가 된다.
 */
export const ACHIEVEMENTS: Record<string, AchievementDefinition> = {
  // ── 글 ──────────────────────────────────────────────────────────────
  FIRST_POST: {
    key: 'FIRST_POST',
    name: '첫 글 작성',
    description: '처음으로 글을 써서 이야기를 시작했습니다.',
    icon: 'FaPencilAlt',
    points: 10,
    tier: 'bronze',
  },
  POST_COUNT_10: {
    key: 'POST_COUNT_10',
    name: '성실한 작가',
    description: '글을 10개 썼습니다.',
    icon: 'FaPencilAlt',
    points: 20,
    tier: 'bronze',
  },
  POST_COUNT_50: {
    key: 'POST_COUNT_50',
    name: '열정적인 작가',
    description: '글을 50개 썼습니다.',
    icon: 'FaAward',
    points: 50,
    tier: 'bronze',
  },
  POST_COUNT_100: {
    key: 'POST_COUNT_100',
    name: '백 편의 기록',
    description: '글을 100개 썼습니다.',
    icon: 'FaAward',
    points: 100,
    tier: 'silver',
  },
  POST_COUNT_250: {
    key: 'POST_COUNT_250',
    name: '쌓여 가는 서재',
    description: '글을 250개 썼습니다.',
    icon: 'FaAward',
    points: 250,
    tier: 'silver',
  },
  POST_COUNT_500: {
    key: 'POST_COUNT_500',
    name: '기록의 습관',
    description: '글을 500개 썼습니다.',
    icon: 'FaTrophy',
    points: 500,
    tier: 'gold',
  },
  POST_COUNT_1000: {
    key: 'POST_COUNT_1000',
    name: '천 편의 세월',
    description: '글을 1,000개 썼습니다.',
    icon: 'FaTrophy',
    points: 1000,
    tier: 'gold',
  },

  // ── 덧글 ────────────────────────────────────────────────────────────
  FIRST_COMMENT: {
    key: 'FIRST_COMMENT',
    name: '첫 덧글',
    description: '처음으로 덧글을 달아 대화를 시작했습니다.',
    icon: 'FaComment',
    points: 5,
    tier: 'bronze',
  },
  COMMENT_COUNT_10: {
    key: 'COMMENT_COUNT_10',
    name: '말 거는 사람',
    description: '덧글을 10개 달았습니다.',
    icon: 'FaComment',
    points: 10,
    tier: 'bronze',
  },
  COMMENT_COUNT_50: {
    key: 'COMMENT_COUNT_50',
    name: '대화의 즐거움',
    description: '덧글을 50개 달았습니다.',
    icon: 'FaComments',
    points: 25,
    tier: 'bronze',
  },
  COMMENT_COUNT_100: {
    key: 'COMMENT_COUNT_100',
    name: '수다쟁이',
    description: '덧글을 100개 달았습니다.',
    icon: 'FaComments',
    points: 50,
    tier: 'silver',
  },
  COMMENT_COUNT_250: {
    key: 'COMMENT_COUNT_250',
    name: '오래 나눈 이야기',
    description: '덧글을 250개 달았습니다.',
    icon: 'FaComments',
    points: 100,
    tier: 'silver',
  },
  COMMENT_COUNT_500: {
    key: 'COMMENT_COUNT_500',
    name: '대화의 장인',
    description: '덧글을 500개 달았습니다.',
    icon: 'FaTrophy',
    points: 250,
    tier: 'gold',
  },
  COMMENT_COUNT_1000: {
    key: 'COMMENT_COUNT_1000',
    name: '천 마디',
    description: '덧글을 1,000개 달았습니다.',
    icon: 'FaTrophy',
    points: 500,
    tier: 'gold',
  },

  // ── 글이 닿은 정도 ──────────────────────────────────────────────────
  POST_10_LIKES: {
    key: 'POST_10_LIKES',
    name: '인기 글',
    description: '한 글이 좋아요를 10개 받았습니다.',
    icon: 'FaHeart',
    points: 50,
    tier: 'bronze',
  },
  POST_50_LIKES: {
    key: 'POST_50_LIKES',
    name: '모두의 글',
    description: '한 글이 좋아요를 50개 받았습니다.',
    icon: 'FaHeart',
    points: 200,
    tier: 'gold',
  },
  POST_100_VIEWS: {
    key: 'POST_100_VIEWS',
    name: '읽히는 글',
    description: '한 글이 100번 읽혔습니다.',
    icon: 'FaEye',
    points: 30,
    tier: 'bronze',
  },
  POST_1000_VIEWS: {
    key: 'POST_1000_VIEWS',
    name: '멀리 간 글',
    description: '한 글이 1,000번 읽혔습니다.',
    icon: 'FaEye',
    points: 150,
    tier: 'silver',
  },

  // ── 웹어드벤처 ──────────────────────────────────────────────────────
  WA_FIRST_RUN: {
    key: 'WA_FIRST_RUN',
    name: '첫 모험',
    description: '웹어드벤처를 처음 끝까지 플레이했습니다.',
    icon: 'FaCompass',
    points: 20,
    tier: 'bronze',
  },
  WA_RUN_10: {
    key: 'WA_RUN_10',
    name: '다시 또 한 번',
    description: '웹어드벤처를 10번 완주했습니다.',
    icon: 'FaCompass',
    points: 50,
    tier: 'bronze',
  },
  WA_RUN_50: {
    key: 'WA_RUN_50',
    name: '길을 아는 자',
    description: '웹어드벤처를 50번 완주했습니다.',
    icon: 'FaMapSigns',
    points: 150,
    tier: 'silver',
  },
  WA_RUN_100: {
    key: 'WA_RUN_100',
    name: '백 번의 여정',
    description: '웹어드벤처를 100번 완주했습니다.',
    icon: 'FaMapSigns',
    points: 300,
    tier: 'gold',
  },
  WA_ENDING_3: {
    key: 'WA_ENDING_3',
    name: '갈림길',
    description: '서로 다른 엔딩을 3가지 보았습니다.',
    icon: 'FaBookOpen',
    points: 80,
    tier: 'silver',
  },
  WA_ENDING_ALL: {
    key: 'WA_ENDING_ALL',
    name: '연대기 수집가',
    description: '모든 엔딩을 보았습니다.',
    icon: 'FaBookOpen',
    points: 400,
    tier: 'gold',
  },
  WA_PROTAGONIST_ALL: {
    key: 'WA_PROTAGONIST_ALL',
    name: '세 사람의 눈',
    description: '주인공 셋을 모두 굴려 보았습니다.',
    icon: 'FaUsers',
    points: 200,
    tier: 'silver',
  },
  WA_CLEAN_RUN: {
    key: 'WA_CLEAN_RUN',
    name: '티 없는 여정',
    description: '오염도 0으로 완주했습니다.',
    icon: 'FaFeather',
    points: 300,
    tier: 'gold',
    hidden: true,
  },

  // ── 레트로 ──────────────────────────────────────────────────────────
  RETRO_FIRST_ROM: {
    key: 'RETRO_FIRST_ROM',
    name: '오락실 개장',
    description: '레트로 게임을 처음 올렸습니다.',
    icon: 'FaGamepad',
    points: 20,
    tier: 'bronze',
  },
  RETRO_ROM_10: {
    key: 'RETRO_ROM_10',
    name: '수집가의 선반',
    description: '레트로 게임을 10개 모았습니다.',
    icon: 'FaGamepad',
    points: 100,
    tier: 'silver',
  },
  RETRO_FIRST_SAVE: {
    key: 'RETRO_FIRST_SAVE',
    name: '여기서 이어서',
    description: '레트로 게임을 처음 저장했습니다.',
    icon: 'FaSave',
    points: 15,
    tier: 'bronze',
  },
  RETRO_SAVE_10: {
    key: 'RETRO_SAVE_10',
    name: '이어달리기',
    description: '레트로 게임 저장을 10개 만들었습니다.',
    icon: 'FaSave',
    points: 80,
    tier: 'silver',
  },

  // ── 함께한 시간 ─────────────────────────────────────────────────────
  ANNIVERSARY_1: {
    key: 'ANNIVERSARY_1',
    name: '한 해를 함께',
    description: '가입한 지 1년이 지났습니다.',
    icon: 'FaCalendarCheck',
    points: 100,
    tier: 'silver',
  },
  ANNIVERSARY_2: {
    key: 'ANNIVERSARY_2',
    name: '두 해를 함께',
    description: '가입한 지 2년이 지났습니다.',
    icon: 'FaCalendarCheck',
    points: 250,
    tier: 'gold',
  },

  // ── 리듬 ────────────────────────────────────────────────────────────
  STREAK_7: {
    key: 'STREAK_7',
    name: '이레 연속',
    description: '7일 내리 글을 썼습니다.',
    icon: 'FaFire',
    points: 150,
    tier: 'silver',
  },
  WEEKEND_WRITER: {
    key: 'WEEKEND_WRITER',
    name: '주말의 작가',
    description: '주말에 쓴 글이 10개가 되었습니다.',
    icon: 'FaCoffee',
    points: 60,
    tier: 'bronze',
  },

  // ── 탐험 ────────────────────────────────────────────────────────────
  EXPLORER_3: {
    key: 'EXPLORER_3',
    name: '둘러보는 사람',
    description: '서로 다른 기능을 3가지 써 봤습니다.',
    icon: 'FaCompass',
    points: 50,
    tier: 'bronze',
  },
  EXPLORER_ALL: {
    key: 'EXPLORER_ALL',
    name: '구석구석',
    description: '글·덧글·웹어드벤처·레트로를 모두 써 봤습니다.',
    icon: 'FaTrophy',
    points: 300,
    tier: 'gold',
  },

  // ── 숨김 ────────────────────────────────────────────────────────────
  NIGHT_OWL: {
    key: 'NIGHT_OWL',
    name: '새벽의 기록',
    description: '새벽 0시에서 5시 사이에 글을 썼습니다.',
    icon: 'FaMoon',
    points: 40,
    tier: 'bronze',
    hidden: true,
  },
  BIRTHDAY_VISIT: {
    key: 'BIRTHDAY_VISIT',
    name: '생일에도 여기',
    description: '생일 당일에 들렀습니다.',
    icon: 'FaBirthdayCake',
    points: 100,
    tier: 'silver',
    hidden: true,
  },
};
