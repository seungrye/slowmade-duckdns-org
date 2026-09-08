// The web-adventure inline script parser (pure functions).
//
// MIRROR - kept in sync with webapp/src/lib/web-adventure/script.ts. The grammar contract is the site's FORMAT.md.
//   interpolate: substitutes {{variable}} (an undefined key keeps its original text).
//   parseScript: breaks one paragraph into an ordered sequence of display-text runs and << directives >>.
//   (The long-term goal is to split this parser into a TS package shared by the web and the app - README M4.)

/** Substitutes `{{variable}}` with vars' value. An undefined variable keeps its original text (so an author's typo is not hidden). */
export function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole,
  );
}

const DIRECTIVE_RE = /<<([^>]*?)>>/g;

/**
 * Breaks one paragraph into an ordered sequence of display-text runs and << >> directives.
 * The display text has {{variable}} substituted by interpolate. Empty text runs and empty <<>> are not included.
 * @returns {Array<{kind:'text',text:string}|{kind:'directive',cmd:string,args:string[],raw:string}>}
 */
export function parseScript(paragraph, vars) {
  const out = [];
  let last = 0;
  let m;
  DIRECTIVE_RE.lastIndex = 0;
  const pushText = (s) => {
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

/** A convenience - drops the directives and joins the display text ({{variable}} substituted). For slice 1's body rendering. */
export function stripDirectives(paragraph, vars) {
  return parseScript(paragraph, vars)
    .filter((s) => s.kind === "text")
    .map((s) => s.text)
    .join("");
}
