// The ROM download bundle (#194) - the pure part.
//
// What to watch for is **name collisions**. On arcade, the ROM and the parent set are both zips and can be uploaded
// under the same name (a document really did use `ddsoma.zip` as both the main ROM and the parent).
// Colliding names inside a zip mean the later one overwrites the earlier, and **a file silently disappears.**

/** What cannot appear in a name inside a zip - path separators and control characters. */
function safeName(raw: string, fallback: string): string {
  const cleaned = String(raw ?? '')
    .replace(/[/\\]/g, '_')
    // 제어문자는 파일명에 못 쓴다 — zip 도구·파일시스템이 싫어한다.
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  return cleaned || fallback;
}

/** Just the extension of a filename (the dot included). Empty when there is none. */
function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
}

/** The name with the extension stripped. */
function baseOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** `a.zip` -> `a (2).zip`. The extension is preserved - otherwise it will not open. */
function numbered(name: string, n: number): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
}

export interface BundleParts {
  romName: string;
  /** The patch in use. Empty when there is none. */
  patchName?: string;
  /** The arcade parent ROM sets - included because it will not run without them. */
  parentNames?: string[];
}

/**
 * The names to put in the zip, in the order ROM -> patch -> parent sets.
 *
 * **Collisions are numbered apart.** Overwriting costs the recipient a file, and it is hard to notice (a zip quietly
 * keeps only the last).
 */
export function bundleEntryNames({ romName, patchName, parentNames }: BundleParts): string[] {
  const rom = safeName(romName, 'rom');
  // The patch is pinned to **the ROM's name plus `-patch`** (#198). Keeping its original name makes it hard to tell
  // which file is the patch - a ROM and its patch really did share a name (`ddsomu.zip`). The extension is preserved
  // so the format (ips, bps, zip) stays visible.
  const patch = patchName ? `${baseOf(rom)}-patch${extOf(safeName(patchName, 'patch'))}` : null;

  const wanted = [
    rom,
    ...(patch ? [patch] : []),
    ...(parentNames ?? []).map((n, i) => safeName(n, `parent${i + 1}`)),
  ];

  const used = new Set<string>();
  return wanted.map((name) => {
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    let n = 2;
    while (used.has(numbered(name, n))) n++;
    const unique = numbered(name, n);
    used.add(unique);
    return unique;
  });
}

/** The zip's filename. The title is the name, so only what filesystems dislike is stripped. */
export function bundleFileName(title: string): string {
  // 100 characters is safe on any filesystem and still enough to recognise the title.
  return `${safeName(title, 'rom').slice(0, 100)}.zip`;
}
