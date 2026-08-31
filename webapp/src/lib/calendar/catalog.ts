import type { CalendarEvent, EventKind } from './types';

/**
 * 날 이름 → 아이콘·설명 표 (#328) — 순수.
 *
 * 특일 정보 API 는 **이름만** 준다(`'설날'`). "무슨 날인지 친절한 설명"은 우리가 쓴다 —
 * 그게 이 기능의 알맹이다.
 *
 * 아이콘은 **서로 겹치지 않게** 고른다(테스트가 강제한다). 아이콘만 보고 무슨 날인지
 * 짐작할 수 있어야 툴팁을 열기 전에도 쓸모가 있다.
 */

type CatalogEntry = { icon: string; description: string };

export const CATALOG: Record<string, CatalogEntry> = {
  // ── 법정공휴일 ──
  신정: { icon: '🎊', description: '새해 첫날. 한 해의 시작을 축하합니다.' },
  설날: { icon: '🧧', description: '음력 새해 첫날. 차례를 지내고 세배를 합니다.' },
  삼일절: { icon: '✊', description: '1919년 3·1 독립운동을 기리는 날입니다.' },
  부처님오신날: { icon: '🪷', description: '석가모니의 탄생을 기리는 날. 연등을 밝힙니다.' },
  어린이날: { icon: '🎈', description: '어린이가 밝고 곧게 자라기를 바라는 날입니다.' },
  현충일: { icon: '🕯️', description: '나라를 위해 목숨을 바친 분들을 기리는 날입니다.' },
  광복절: { icon: '🎗️', description: '1945년 일제로부터 해방된 것을 기리는 날입니다.' },
  추석: { icon: '🌕', description: '한가위. 햇곡식으로 차례를 지내고 성묘합니다.' },
  개천절: { icon: '🏔️', description: '단군이 고조선을 세운 것을 기리는 날입니다.' },
  한글날: { icon: '📖', description: '세종대왕이 훈민정음을 반포한 것을 기리는 날입니다.' },
  기독탄신일: { icon: '🎄', description: '성탄절. 예수의 탄생을 기념하는 날입니다.' },
  대체공휴일: { icon: '🔁', description: '공휴일이 주말과 겹쳐 대신 쉬는 날입니다.' },

  // ── 기념일 ──
  제헌절: { icon: '📜', description: '1948년 헌법이 공포된 것을 기리는 날입니다.' },
  식목일: { icon: '🌳', description: '나무를 심고 가꾸는 날입니다.' },
  근로자의날: { icon: '🛠️', description: '일하는 사람들의 노고를 기리는 날입니다.' },
  어버이날: { icon: '🌹', description: '부모님께 감사를 전하는 날입니다.' },
  스승의날: { icon: '🍎', description: '가르쳐 주신 분들께 감사를 전하는 날입니다.' },
  성년의날: { icon: '🌷', description: '만 19세가 된 이들의 성년을 축하하는 날입니다.' },
  부부의날: { icon: '💑', description: '부부가 서로에게 고마움을 전하는 날입니다.' },
  국군의날: { icon: '🎖️', description: '국군의 노고를 기리는 날입니다.' },
  전국동시지방선거: { icon: '🗳️', description: '지방자치단체장과 의원을 뽑는 날. 임시공휴일입니다.' },
  '4·19혁명기념일': { icon: '🕊️', description: '1960년 4·19 혁명을 기리는 날입니다.' },
  '5·18민주화운동기념일': { icon: '🌼', description: '1980년 5·18 민주화운동을 기리는 날입니다.' },
  '6·25전쟁일': { icon: '🪖', description: '1950년 한국전쟁이 일어난 날을 기리는 날입니다.' },
  순국선열의날: { icon: '🏵️', description: '나라를 위해 목숨을 바친 선열을 기리는 날입니다.' },
  환경의날: { icon: '🌏', description: '환경 보전의 중요성을 되새기는 날입니다.' },
  소방의날: { icon: '🚒', description: '소방관의 노고를 기리는 날입니다.' },
  경찰의날: { icon: '👮', description: '경찰의 노고를 기리는 날입니다.' },
  장애인의날: { icon: '♿', description: '장애인에 대한 이해를 넓히는 날입니다.' },
  노인의날: { icon: '🧓', description: '어르신을 공경하는 마음을 되새기는 날입니다.' },

  // ── 24절기 ──
  입춘: { icon: '🌱', description: '봄의 시작을 알리는 절기입니다.' },
  우수: { icon: '💧', description: '눈이 녹아 비가 되는 절기입니다.' },
  경칩: { icon: '🐸', description: '겨울잠 자던 개구리가 깨어나는 절기입니다.' },
  춘분: { icon: '🌗', description: '낮과 밤의 길이가 같아지는 날입니다. 이후로 낮이 길어집니다.' },
  청명: { icon: '🌤️', description: '하늘이 맑아지는 절기. 봄 농사를 준비합니다.' },
  곡우: { icon: '🌾', description: '봄비가 내려 곡식이 자라는 절기입니다.' },
  입하: { icon: '🌿', description: '여름의 시작을 알리는 절기입니다.' },
  소만: { icon: '🍃', description: '만물이 자라 가득 차기 시작하는 절기입니다.' },
  망종: { icon: '🌽', description: '보리를 거두고 모를 심는 절기입니다.' },
  하지: { icon: '☀️', description: '낮이 일 년 중 가장 긴 날입니다.' },
  소서: { icon: '🌡️', description: '본격적인 더위가 시작되는 절기입니다.' },
  대서: { icon: '🔥', description: '일 년 중 가장 더운 절기입니다.' },
  입추: { icon: '🍂', description: '가을의 시작을 알리는 절기입니다.' },
  처서: { icon: '🦗', description: '더위가 물러가고 선선해지는 절기입니다.' },
  백로: { icon: '💦', description: '이슬이 맺히기 시작하는 절기입니다.' },
  추분: { icon: '🌓', description: '낮과 밤의 길이가 같아지는 날입니다. 이후로 밤이 길어집니다.' },
  한로: { icon: '🍁', description: '찬 이슬이 맺히는 절기입니다.' },
  상강: { icon: '🌫️', description: '서리가 내리기 시작하는 절기입니다.' },
  입동: { icon: '🧣', description: '겨울의 시작을 알리는 절기입니다.' },
  소설: { icon: '🌨️', description: '첫눈이 내릴 무렵의 절기입니다.' },
  대설: { icon: '❄️', description: '눈이 가장 많이 내린다는 절기입니다.' },
  동지: { icon: '🍲', description: '밤이 일 년 중 가장 긴 날. 팥죽을 먹습니다.' },
  소한: { icon: '🥶', description: '겨울 추위가 매서워지는 절기입니다.' },
  대한: { icon: '🧊', description: '겨울 추위의 마지막 고비인 절기입니다.' },
};

/**
 * API 가 쓰는 이름과 우리가 쓰는 이름이 다른 경우.
 * 예: 신정은 `dateName` 이 `'1월1일'` 로 온다.
 */
const ALIAS: Record<string, string> = {
  '1월1일': '신정',
  크리스마스: '기독탄신일',
  석가탄신일: '부처님오신날',
  // 공휴일 엔드포인트는 '노동절', 기념일 엔드포인트는 '근로자의 날' 로 같은 날을 부른다.
  노동절: '근로자의날',
};

/**
 * 이름 뒤에 괄호가 붙어 오는 것들. 실측: `대체공휴일(개천절)`·`대체공휴일(광복절)` …
 * 괄호까지 표에 넣으면 매년 조합이 달라져 끝이 없으므로, 앞부분으로 찾고 **표시 이름은
 * 원문 그대로** 둔다 — 어느 공휴일의 대체인지가 정보다.
 */
const PREFIX_KEYS = ['대체공휴일'];

/** 표에 없는 이름도 반드시 보여준다 — 안 그러면 API 가 새 기념일을 줄 때 조용히 샌다. */
export const FALLBACK_ICON: Record<EventKind, string> = {
  holiday: '🎌',
  anniversary: '📌',
  season: '🗓️',
};

/**
 * 공백을 지운다. 실측해 보니 **엔드포인트마다 띄어쓰기가 다르다** — 기념일은 `'어버이 날'`,
 * `'스승의 날'`, `'국군의 날'` 처럼 띄어 쓰고 공휴일은 붙여 쓴다. 표를 두 벌 두는 대신
 * 찾을 때 공백을 지운다.
 */
function normalize(name: string): string {
  return name.replace(/\s+/g, '');
}

export function decorate(name: string, kind: EventKind): CalendarEvent {
  const trimmed = name.trim();
  const normalized = normalize(trimmed);
  const key = ALIAS[normalized] ?? normalized;
  const entry = CATALOG[key];

  if (entry) {
    return { name: key, kind, icon: entry.icon, description: entry.description };
  }

  // `대체공휴일(개천절)` 처럼 괄호가 붙은 것 — 표시 이름은 원문을 살린다.
  const prefix = PREFIX_KEYS.find((p) => normalized.startsWith(p));
  if (prefix) {
    const base = CATALOG[prefix];
    return { name: trimmed, kind, icon: base.icon, description: base.description };
  }

  return { name: trimmed, kind, icon: FALLBACK_ICON[kind], description: '' };
}
