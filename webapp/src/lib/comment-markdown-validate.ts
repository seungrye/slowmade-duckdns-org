// Comment markdown validation - it catches only *plainly broken* patterns before submission.
//
// Markdown is forgiving by nature and most of it just renders as text, but half-finished links and code do not
// render as intended, so the author is told before posting.
// Bold and italic (* _) are not checked - multiplication and emphasis produce too many false positives.
//
// Returns: an error message (string), or null when nothing is wrong.

export function validateCommentMarkdown(text: string): string | null {
  // 1) Code fence ``` pairing - an odd count turns the rest of the text into a code block.
  const fences = (text.match(/```/g) ?? []).length;
  if (fences % 2 !== 0) {
    return '닫히지 않은 코드 블록(```)이 있어요. ``` 을 짝으로 맞춰주세요.';
  }

  // 2) Inline backticks - odd after removing the code fences means it is broken.
  const noFence = text.replace(/```[\s\S]*?```/g, '');
  const ticks = (noFence.match(/`/g) ?? []).length;
  if (ticks % 2 !== 0) {
    return '닫히지 않은 인라인 코드(`)가 있어요. ` 을 짝으로 맞춰주세요.';
  }

  // 3) Links and images - fewer *complete* links than attempts at `](` means something is broken.
  //    Complete forms: [text](url) and ![alt](url). URLs are assumed free of spaces and parentheses.
  const linkAttempts = (text.match(/\]\(/g) ?? []).length;
  const completeLinks = (text.match(/!?\[[^\]]*\]\([^()\s]+\)/g) ?? []).length;
  if (linkAttempts > completeLinks) {
    return '링크 문법이 올바르지 않아요. [텍스트](https://주소) 형식인지 확인해주세요.';
  }

  return null;
}
