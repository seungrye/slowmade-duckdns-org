/**
 * Shortens text to `max` characters and appends an ellipsis when it was cut.
 *
 * **Characters are counted as a person sees them** (#271). JavaScript strings are UTF-16 code units, so cutting with
 * `slice` **splits in half** a character that takes two units, such as an emoji - and a broken glyph appears on
 * screen. The notification excerpt calls this with 200, so a 200th landing mid-emoji went out like that.
 *
 * Things joined by ZWJs, such as a family emoji (`👨‍👩‍👧`) or a flag, are also treated as one unit.
 */
export function truncate(text: string, max: number): string {
  if (max <= 0) return "";
  const normalized = text.replace(/\r?\n/g, " ").trim();

  const 글자들 = graphemes(normalized);
  if (글자들.length <= max) return normalized;
  return `${글자들.slice(0, max).join("")}…`;
}

/**
 * Splits into the characters a person sees.
 *
 * `Intl.Segmenter` groups combining characters into one unit (Node 18+ and modern browsers).
 * Where it is absent it falls back to code points - a combined emoji is split, but **at least a surrogate is never
 * cut in half.** That beats emitting a half.
 */
function graphemes(s: string): string[] {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Segmenter) {
    return Array.from(new Segmenter("ko", { granularity: "grapheme" }).segment(s),
      (seg) => seg.segment);
  }
  // The spread operator works per code point and keeps surrogate pairs together.
  return [...s];
}
