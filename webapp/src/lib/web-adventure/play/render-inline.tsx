import type { ReactNode } from "react";

/**
 * 씬 본문 인라인 마크다운 렌더 — **굵게**(인물명) / *이탤릭*(지문). 희곡체 표시용.
 * 중첩은 지원하지 않는 단순 토크나이저(본문은 평면 사용).
 */
export function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let k = 0;
  let mt: RegExpExecArray | null;
  while ((mt = re.exec(text)) !== null) {
    if (mt.index > last) nodes.push(text.slice(last, mt.index));
    const tok = mt[0];
    if (tok.startsWith("**")) {
      nodes.push(
        <strong key={k++} className="font-bold">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <em key={k++} className="italic text-stone-500 dark:text-stone-400">
          {tok.slice(1, -1)}
        </em>,
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
