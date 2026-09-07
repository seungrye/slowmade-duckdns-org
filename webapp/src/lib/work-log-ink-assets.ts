// Serving work_log's handwriting recognition assets (#415) - the pure part.
//
// Moving the app's handwriting engine to MyScript iink (seungrye/work_log#82) made the Korean recognition assets
// necessary to run. But **the terms forbid end users fetching them from MyScript's servers** -
// whoever receives them must host and serve them. So they are served the way the APK is.

/** Where the assets live. Alongside the APK (`work-log/app-release.apk`). */
const ASSET_DIR = 'work-log/ink-assets';

/** The characters accepted in a name. Accepting only these filters out slashes, dots, %, whitespace and Hangul entirely. */
const STEM = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Turns the filename the app requested into a MinIO key. **Anything suspicious gives null** - the caller returns a 400.
 *
 * Appending the name to the key as is would let `../app-release.apk` and the like **reach another object.**
 * Overwriting the APK would have the app download and try to install something unusable. So the accepted characters
 * are kept narrow and everything else is refused - choosing what to accept is safer than choosing what to strip.
 */
export function assetObjectKey(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed.endsWith('.zip')) return null;

  const stem = trimmed.slice(0, -'.zip'.length);
  if (!STEM.test(stem)) return null;

  return `${ASSET_DIR}/${stem}.zip`;
}
