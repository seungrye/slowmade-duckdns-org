// The scene CMS's body tabs - [treatment | default | Tolkien style | + add a style] (#79).
//
// One scene has three bundles of text:
//   treatment  the skeleton of the events (the canonical writing text). **It never reaches the screen.**
//   body       the default-style body. It is also the fallback when there is no variant.
//   variants   the per-style bodies { [voice]: string[] } - free-form keys, so adding an author needs no schema change.
//
// Only the read and write rules are split out as pure functions. The form just calls them, so
// adding tabs never means touching the UI code.

/** The treatment tab's internal key - it uses a colon so it cannot collide with a style name. */
export const TREATMENT_TAB = ':treatment';
/** The default body tab's internal key. */
export const BODY_TAB = ':body';

export interface TabbedScene {
  body?: string[];
  treatment?: string[];
  variants?: Record<string, string[]>;
}

/** The human-readable tab name. An unknown style uses the key as is. */
const LABELS: Record<string, string> = {
  [TREATMENT_TAB]: '트리트먼트',
  [BODY_TAB]: '기본',
  tolkien: '톨킨 풍',
  prose: '산문 풍',
};

export function tabLabel(tab: string): string {
  return LABELS[tab] ?? tab;
}

/**
 * The tabs to show. Treatment and default come first, then the styles by name.
 * A variant with an empty value still gets a tab - a style being written must not disappear.
 */
export function bodyTabs(scene: TabbedScene): string[] {
  const voices = Object.keys(scene.variants ?? {}).sort();
  return [TREATMENT_TAB, BODY_TAB, ...voices];
}

/** The paragraph array that tab holds. An empty array when absent. */
export function readTab(scene: TabbedScene, tab: string): string[] {
  if (tab === TREATMENT_TAB) return scene.treatment ?? [];
  if (tab === BODY_TAB) return scene.body ?? [];
  return scene.variants?.[tab] ?? [];
}

/** Returns a new scene with only that tab replaced (the original is untouched). */
export function writeTab<T extends TabbedScene>(scene: T, tab: string, lines: string[]): T {
  if (tab === TREATMENT_TAB) return { ...scene, treatment: lines };
  if (tab === BODY_TAB) return { ...scene, body: lines };
  return { ...scene, variants: { ...(scene.variants ?? {}), [tab]: lines } };
}
