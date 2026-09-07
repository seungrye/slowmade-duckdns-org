// Identifying split ROM sets (#143).
//
// An arcade clone set holds only the region-specific files, with the rest in the parent zip. When several zips are
// uploaded at once, **which is the game (the clone) and which is the parent** has to be worked out.
//
// The clue is the name. In MAME and FBA **a clone's name starts with its parent's** -
// `ddsom` (parent) -> `ddsoma`, `ddsomu`, `ddsomr1` (clones). So **whichever is the prefix is the parent**.
//
// When the rule does not fit it reports `ambiguous`. Guessing quietly boots the wrong region, and that is the kind of
// mistake that is hard to notice.

export interface RomSetClassification {
  /** The game name to give the core - this zip's name is the ROM set's name. */
  game: string | null;
  /** The parents to place alongside it, listed **from the general upward** - the core walks back through them as needed. */
  parents: string[];
  /** The name rule could not decide - better to confirm in the UI. */
  ambiguous: boolean;
  /** A one-liner to show as is in the UI. */
  summary: string;
}

/** With the extension stripped and lowercased. */
const base = (name: string) => name.replace(/\.[^.]*$/, '').toLowerCase();

export function classifyRomSet(filenames: string[]): RomSetClassification {
  const names = filenames.filter(Boolean);
  if (names.length === 0) {
    return { game: null, parents: [], ambiguous: false, summary: '올린 파일이 없습니다.' };
  }
  if (names.length === 1) {
    return { game: names[0], parents: [], ambiguous: false, summary: `게임: ${names[0]}` };
  }

  // Shortest name first = most general first. The longest is the game (the most specific clone).
  const sorted = [...names].sort((a, b) => base(a).length - base(b).length);
  const game = sorted[sorted.length - 1];
  const parents = sorted.slice(0, -1);

  // Checking the rule - each must be a prefix of the next. Duplicate names also count as not fitting.
  const bases = sorted.map(base);
  const ambiguous =
    new Set(bases).size !== bases.length ||
    bases.some((b, i) => i > 0 && !bases[i].startsWith(bases[i - 1]));

  const summary = ambiguous
    ? `이름 규칙으로 가리지 못했습니다 — 게임을 ${game} 로 봅니다. 함께 병합: ${parents.join(', ')}`
    : `게임: ${game} · 함께 병합: ${parents.join(', ')}`;

  return { game, parents, ambiguous, summary };
}
