// 코멘트 마크다운 문법 검증 — 제출 전 *명백히 깨진* 패턴만 잡는다.
//
// 마크다운은 본래 관대해서 대부분 텍스트로 처리되지만, 링크/코드처럼 "쓰려다
// 만" 경우는 의도대로 렌더되지 않으므로 등록 전에 알려준다.
// 볼드/이탤릭(* _)은 곱셈·강조 등 오탐(false positive)이 많아 검사하지 않는다.
//
// 반환: 에러 메시지(string) 또는 null(문제 없음).

export function validateCommentMarkdown(text: string): string | null {
  // 1) 코드 펜스 ``` 짝 — 홀수면 나머지 전체가 코드블록이 됨.
  const fences = (text.match(/```/g) ?? []).length;
  if (fences % 2 !== 0) {
    return '닫히지 않은 코드 블록(```)이 있어요. ``` 을 짝으로 맞춰주세요.';
  }

  // 2) 인라인 백틱 — 코드펜스를 제거한 뒤 홀수면 깨짐.
  const noFence = text.replace(/```[\s\S]*?```/g, '');
  const ticks = (noFence.match(/`/g) ?? []).length;
  if (ticks % 2 !== 0) {
    return '닫히지 않은 인라인 코드(`)가 있어요. ` 을 짝으로 맞춰주세요.';
  }

  // 3) 링크/이미지 — `](` 시도 횟수보다 *완성된* 링크가 적으면 깨진 것.
  //    완성형: [텍스트](주소) / ![대체텍스트](주소). 주소에 공백·괄호 없음 가정.
  const linkAttempts = (text.match(/\]\(/g) ?? []).length;
  const completeLinks = (text.match(/!?\[[^\]]*\]\([^()\s]+\)/g) ?? []).length;
  if (linkAttempts > completeLinks) {
    return '링크 문법이 올바르지 않아요. [텍스트](https://주소) 형식인지 확인해주세요.';
  }

  return null;
}
