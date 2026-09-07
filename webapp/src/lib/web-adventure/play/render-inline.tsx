import type { ReactNode } from "react";
import { interpolate } from "../script";

/**
 * Rendering the inline markup of scene bodies and choices - The Fall of Eternia's formatting convention.
 * (The full convention: src/content/web-adventure/FORMAT.md)
 *
 *   **name**   a character's name - bold
 *   *stage*    stage directions and narrative emphasis - grey italic
 *   "dialogue" quoted dialogue - amber (a gaslight tone). No markup needed; the quotes alone apply it
 *   [[noun]]   places, items and proper concepts - teal (the brackets are not shown)
 *   {{var}}    dynamic text - substituted from vars (character.variables). Undefined keeps the original.
 *
 * A simple tokeniser with no nesting (bodies stay flat - no markup inside dialogue).
 * (`<< directives >>` are not handled here - parseScript and SceneRenderer do that.)
 */
export function renderInline(text: string, vars?: Record<string, string | number>): ReactNode[] {
  text = interpolate(text, vars);
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
