// Uploading work_log diagnostics (#409) - the pure part.
//
// When the app dies, the trail is left on the phone alone. Someone has to run 'export diagnostics' and send it in,
// and one missing step in between means nothing is seen at all - three builds really were fixed with no trail.
// So the app uploads it over **a channel that already exists** (the x-app-key path used for APK distribution).
//
// Unlike an APK it is **text**, so it is small. It goes straight into the DB, with no need for MinIO.

/** The cap on the diagnostic text accepted. In practice it is tens of KB - 1MB is generous and stays clear of Next's 10MB wall. */
export const MAX_DIAG_BYTES = 1024 * 1024;

/** Version and device names are short. Anything longer is truncated - so the list is not wrecked. */
const MAX_LABEL = 120;

export interface DiagUpload {
  versionCode: number;
  versionName: string;
  device: string;
  /** Why it was uploaded - a short word like 'crash', 'anr' or 'manual'. Used when scanning the list. */
  kind: string;
  body: string;
}

/**
 * Judges whether what arrived is usable. **Unusable gives null** - the caller returns a 400.
 *
 * A missing version or device is accepted (an older build might upload it). **An empty body is not** -
 * piling up empties only pushes out the twenty most recent slots.
 */
export function parseDiagUpload(raw: {
  versionCode?: unknown;
  versionName?: unknown;
  device?: unknown;
  kind?: unknown;
  body?: unknown;
}): DiagUpload | null {
  const body = typeof raw.body === 'string' ? raw.body : '';
  if (!body.trim()) return null;
  if (Buffer.byteLength(body, 'utf8') > MAX_DIAG_BYTES) return null;

  const code = Number(raw.versionCode);
  return {
    versionCode: Number.isFinite(code) && code > 0 ? Math.floor(code) : 0,
    versionName: clip(raw.versionName),
    device: clip(raw.device),
    kind: clip(raw.kind) || 'unknown',
    body,
  };
}

function clip(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, MAX_LABEL) : '';
}
