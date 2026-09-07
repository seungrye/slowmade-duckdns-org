// The web-adventure inline script parser (pure functions).
//
// The existing display markup (**speaker** *stage* "dialogue" [[noun]]) belongs to render-inline, and
// this extends the body paragraphs along two axes - both backwards compatible (with no tokens it behaves as before):
//   1) {{var}}  -> interpolate() substitutes values into the display text.
//   2) << directive >> -> parseScript() decomposes it into an ordered sequence of "display text runs" and "directives".
//      The renderer executes a directive in place during the reveal (sfx/bgm/fx/img).
//      wait and set are **precomputed per paragraph** here rather than in the renderer (#321) -
//      it is all written in the body the moment the scene arrives, so no state is needed:
//        varsByParagraph()  the per-paragraph <<set>> accumulation    revealSchedule()  the open times with <<wait>> applied
//
// The directive syntax (space separated): <<cmd arg1 arg2 …>>  e.g. <<sfx 문소리>> <<bgm play harbor 500>>
//                                           <<fx fadeout 800>> <<img 매복 impact>> <<wait 600>>

export type ScriptSegment =
  | { kind: "text"; text: string }
  | { kind: "directive"; cmd: string; args: string[]; raw: string };

/**
 * Substitutes `{{var}}` with the value from vars. An undefined variable keeps the original (so an author's typo is not hidden).
 *
 * Variable names **may contain Hangul** (#370). It was `\w` at first, which matches ASCII only, so a name like
 * `{{침식_손}}` quietly stayed as literal text. There is no reason for variable names alone to be in English in a
 * story written in Korean. Nothing in the existing content used a variable at the time, so there was no regression risk either.
 */
export function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{\{([\p{L}\p{N}_]+)\}\}/gu, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole,
  );
}

const DIRECTIVE_RE = /<<([^>]*?)>>/g;

/**
 * Decomposes one paragraph into an ordered sequence of display-text runs and << >> directives.
 * - Display text has its {{var}}s substituted by interpolate.
 * - Empty text runs (between, before or after directives) are not included. An empty <<>> is ignored.
 */
export function parseScript(paragraph: string, vars?: Record<string, string | number>): ScriptSegment[] {
  const out: ScriptSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  DIRECTIVE_RE.lastIndex = 0;
  const pushText = (s: string) => {
    if (s) out.push({ kind: "text", text: interpolate(s, vars) });
  };
  while ((m = DIRECTIVE_RE.exec(paragraph)) !== null) {
    pushText(paragraph.slice(last, m.index));
    const raw = m[1].trim();
    if (raw) {
      const parts = raw.split(/\s+/);
      out.push({ kind: "directive", cmd: parts[0], args: parts.slice(1), raw });
    }
    last = m.index + m[0].length;
  }
  pushText(paragraph.slice(last));
  return out;
}

/**
 * Returns one bundle of interpolation variables per paragraph.
 *
 * - Paragraph i's value = `base` with the `<<set …>>`s of paragraphs 0..i laid over it in order.
 * - The new value applies from **the paragraph containing the set** (wherever in the paragraph it appears, the whole paragraph sees it).
 * - The return length is `body.length`. Each element is an independent object and `base` is never mutated.
 * - `<<set key value…>>` - the remaining arguments are joined with single spaces and stored **as a string** (not
 *   converted to a number: `interpolate` prints through `String()`, so the result is the same, and converting would
 *   turn `"007"` into `7`). A valueless `<<set key>>` or `<<set>>` is ignored. The last of a repeated key wins.
 */
export function varsByParagraph(
  body: string[],
  base?: Record<string, string | number>,
): Array<Record<string, string | number>> {
  // It carries one accumulator and leaves **a copy** at each paragraph - sharing references between elements would
  // mean editing one paragraph changed another.
  let 누적: Record<string, string | number> = { ...(base ?? {}) };
  return body.map((문단) => {
    for (const seg of parseScript(문단)) {
      if (seg.kind !== "directive" || seg.cmd !== "set") continue;
      const [키, ...나머지] = seg.args;
      // A valueless <<set key>> or <<set>> creates no key - inserting an empty value would make
      // interpolate print an empty string instead of the original, hiding the author's typo.
      if (!키 || 나머지.length === 0) continue;
      // Stored as a string. Converting to a number would turn "007" into 7.
      누적 = { ...누적, [키]: 나머지.join(" ") };
    }
    return { ...누적 };  // even with the set at the paragraph's end, the new value applies from that paragraph
  });
}

/**
 * Returns when paragraph i opens (ms from entering the scene), one value per paragraph.
 *
 * - Paragraph 0 is always `0`; paragraph i = `i * stepMs + (the sum of waits in paragraphs 0..i-1)`.
 * - The return length is `body.length`.
 * - `<<wait value>>` - only a finite positive number is added (a missing argument, a non-number, a negative or
 *   Infinity counts as 0). Several in one paragraph all add up. The last paragraph's wait is unused, since no
 *   paragraph opens after it (that is not an error).
 */
export function revealSchedule(body: string[], stepMs: number): number[] {
  const out: number[] = [];
  let 밀린시간 = 0;
  for (let i = 0; i < body.length; i++) {
    out.push(i * stepMs + 밀린시간);
    // This paragraph's wait pushes back **the next** paragraph onward.
    for (const seg of parseScript(body[i])) {
      if (seg.kind !== "directive" || seg.cmd !== "wait") continue;
      const ms = Number(seg.args[0]);
      // Finite positives only. A missing argument, a non-number, a negative or Infinity counts as 0 -
      // one author's typo must never leave a body that never opens.
      if (Number.isFinite(ms) && ms > 0) 밀린시간 += ms;
    }
  }
  return out;
}
