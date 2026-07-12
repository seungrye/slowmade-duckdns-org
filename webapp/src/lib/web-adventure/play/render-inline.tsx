import type { ReactNode } from "react";

/**
 * 씬 본문·선택지 인라인 마크업 렌더 — 〈에테르니아의 추락〉 서식 규약.
 * (규약 전문: src/content/web-adventure/FORMAT.md)
 *
 *   **이름**   인물명 — 굵게
 *   *지문*     무대 지시·서술 강조 — 회색 이탤릭
 *   "대사"     따옴표 대사 — 호박색(가스등 톤). 마크업 불필요, 따옴표만으로 자동 적용
 *   [[명사]]   장소·아이템·고유 개념 — 청록색(괄호는 표시하지 않음)
 *
 * 중첩은 지원하지 않는 단순 토크나이저(본문은 평면 사용 — 대사 안 마크업 금지).
 */
export function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[\[[^\]]+\]\]|"[^"\n]+")/g;
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
    } else if (tok.startsWith("[[")) {
      nodes.push(
        <span key={k++} className="font-medium text-teal-700 dark:text-teal-300">
          {tok.slice(2, -2)}
        </span>,
      );
    } else if (tok.startsWith('"')) {
      nodes.push(
        <span key={k++} className="text-amber-800 dark:text-amber-200">
          {tok}
        </span>,
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
