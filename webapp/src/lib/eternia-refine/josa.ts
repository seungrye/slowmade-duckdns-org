// 조사 고르기 (#463) — 순수.
//
// 로그가 `메스 을(를) 썼다.` 로 나왔다. 괄호로 도망가지 않고 받침을 보고 고른다.
//
// 카드·씬 이름은 콘텐츠에서 오므로 한글만 온다는 보장이 없다. 한자·숫자·영문·괄호가 섞여도
// 문장이 깨지지 않는 것이 여기서 지키는 것이다.

/** 한글 음절 영역. */
const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;

/** 숫자는 **읽는 소리**로 고른다 — "카드 1을"(일), "카드 2를"(이). */
const DIGIT_HAS_BATCHIM: Record<string, boolean> = {
  '0': true, // 영
  '1': true, // 일
  '2': false, // 이
  '3': true, // 삼
  '4': false, // 사
  '5': false, // 오
  '6': true, // 육
  '7': true, // 칠
  '8': true, // 팔
  '9': false, // 구
};

/**
 * 마지막 글자에 받침이 있나.
 *
 * 한글이 아니면 판단할 근거가 없다 — 숫자만 소리로 처리하고 나머지는 **받침 있음**으로
 * 떨어뜨린다. `TQQQ를` 보다 `TQQQ을` 이 덜 어색하고, 무엇보다 둘 다 괄호보다는 낫다.
 */
function hasBatchim(word: string): boolean {
  const last = word.trim().slice(-1);
  if (!last) return true;

  const code = last.charCodeAt(0);
  if (code >= HANGUL_FIRST && code <= HANGUL_LAST) {
    return (code - HANGUL_FIRST) % 28 !== 0;
  }
  if (last in DIGIT_HAS_BATCHIM) return DIGIT_HAS_BATCHIM[last];
  return true;
}

/** 받침이 있으면 `을`, 없으면 `를`. */
export function eulReul(word: string): string {
  return hasBatchim(word) ? '을' : '를';
}

/** 이름에 조사를 붙인다 — 사이에 공백을 두지 않는다. */
export function withJosa(word: string): string {
  return `${word}${eulReul(word)}`;
}
