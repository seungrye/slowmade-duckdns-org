// work_log app distribution (#261) - the pure part.
//
// work_log (the work-notes Android app) gets in-app updates. Eternia looks at GitHub's releases API directly
// (`eternia-app/src/update-check.js`), but **the work_log repo is private**, so the app cannot call that API
// without a token. Embedding a repo read token in the APK opens the whole source the moment it leaks -
// a different order of risk.
//
// So the site tells it instead. The release workflow uploads the new APK, and the app looks only at the site.

/** The APK MIME type Android recognises. Serving it with this is what brings up the install screen. */
export const APK_MIME = 'application/vnd.android.package-archive';

/** The APK size cap. Generous, since releases currently run around 20MB. */
export const MAX_APK_BYTES = 200 * 1024 * 1024;

/** The cap on the change description - it is only a line or two in the notification. */
const MAX_NOTES = 2000;

export interface ReleaseUpload {
  versionCode: number;
  versionName: string;
  notes: string;
}

/**
 * Judges whether to accept the uploaded release.
 *
 * `versionCode` is always required - the app decides "is this newer?" from that number alone, so without it an
 * upload reaches nobody. Comparing names (`0.2`) can go wrong with digit counts and prefixes, so it is not used to decide.
 *
 * @returns the accepted values, or `null` on refusal.
 */
export function parseReleaseUpload(
  input: { versionCode?: unknown; versionName?: unknown; notes?: unknown },
  fileSize: number,
): ReleaseUpload | null {
  const code = Number(String(input.versionCode ?? '').trim());
  if (!Number.isInteger(code) || code < 1) return null;

  const name = String(input.versionName ?? '').trim();
  if (!name) return null;

  // An empty or absurdly large file is treated as a mistake - nothing unusable by the app is stored.
  if (fileSize <= 0 || fileSize > MAX_APK_BYTES) return null;

  return {
    versionCode: code,
    versionName: name,
    notes: String(input.notes ?? '').slice(0, MAX_NOTES),
  };
}
