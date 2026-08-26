/**
 * 글을 `max` 글자로 줄이고, 잘렸으면 말줄임표를 붙인다.
 *
 * **글자 수는 사람이 보는 단위로 센다** (#271). 자바스크립트 문자열은 UTF-16 코드 단위라
 * `slice` 로 자르면 이모지처럼 두 칸을 쓰는 글자가 **반으로 갈린다** — 화면에 깨진 글자가
 * 나온다. 알림 발췌가 200자로 이 함수를 부르므로 200번째가 이모지 중간이면 그대로 나갔다.
 *
 * 가족 이모지(`👨‍👩‍👧`)나 국기처럼 여러 글자가 ZWJ 로 이어진 것도 한 덩어리로 본다.
 */
export function truncate(text: string, max: number): string {
  if (max <= 0) return "";
  const normalized = text.replace(/\r?\n/g, " ").trim();

  const 글자들 = graphemes(normalized);
  if (글자들.length <= max) return normalized;
  return `${글자들.slice(0, max).join("")}…`;
}

/**
 * 사람이 보는 글자 단위로 쪼갠다.
 *
 * `Intl.Segmenter` 가 결합 문자까지 한 덩어리로 묶어 준다(노드 18+·최신 브라우저).
 * 없는 환경에서는 코드 포인트 단위로 떨어진다 — 결합 이모지는 쪼개지지만 **적어도
 * 서로게이트가 반으로 갈리지는 않는다.** 반쪽을 내보내느니 이쪽이 낫다.
 */
function graphemes(s: string): string[] {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Segmenter) {
    return Array.from(new Segmenter("ko", { granularity: "grapheme" }).segment(s),
      (seg) => seg.segment);
  }
  // 전개 연산자는 코드 포인트 단위라 서로게이트 쌍을 붙여 준다.
  return [...s];
}
