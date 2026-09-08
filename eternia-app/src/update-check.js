// On app start it compares the current version with GitHub's latest release and offers the update.
//
// For the app to install it itself it would need the REQUEST_INSTALL_PACKAGES permission and a FileProvider,
// which widens the scope. Here it goes only as far as "check -> the user confirms -> open the download".
//
// A failed check (offline, an API rate limit and so on) is swallowed - an update must never block the game.
// The same policy as content-client's submitAppEndRun.

export const REPO = "seungrye/slowmade-duckdns-org";

/** "v1.0.13" | "1.0.13" -> [1,0,13]. A non-numeric piece is 0. */
export function parseVersion(v) {
  return String(v ?? "")
    .replace(/^v/i, "")
    .split(".")
    .map((p) => {
      const n = parseInt(p, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

/** Whether latest is higher than current. Compared digit group by digit group rather than as strings (10 > 9). */
export function isNewerVersion(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** The signed build (app-release.apk) is preferred - a debug build's signature differs and cannot overwrite it. */
export function pickApkAsset(assets) {
  const list = Array.isArray(assets) ? assets : [];
  return (
    list.find((a) => /release\.apk$/i.test((a && a.name) || "")) ||
    list.find((a) => /\.apk$/i.test((a && a.name) || "")) ||
    null
  );
}

/** The version injected at build time (VITE_APP_VERSION). A local development build has none. */
function resolveCurrentVersion() {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_APP_VERSION) {
      return String(import.meta.env.VITE_APP_VERSION);
    }
  } catch {
    /* import.meta 미지원 환경 */
  }
  return "";
}

/**
 * @returns {Promise<null | {latestVersion, currentVersion, apkUrl, apkName, releaseUrl}>}
 *          null when it is up to date or cannot be checked.
 */
export async function checkForUpdate(opts = {}) {
  const current =
    opts.currentVersion !== undefined ? opts.currentVersion : resolveCurrentVersion();
  if (!current) return null; // With nothing to compare against (a development build) it does not check.

  const fetchImpl = opts.fetchImpl || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);
  if (!fetchImpl) return null;

  try {
    const res = await fetchImpl(
      `https://api.github.com/repos/${opts.repo || REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!res || !res.ok) return null;
    const json = await res.json();
    const tag = String((json && json.tag_name) || "");
    if (!tag || !isNewerVersion(tag, current)) return null;

    const asset = pickApkAsset(json && json.assets);
    return {
      latestVersion: tag.replace(/^v/i, ""),
      currentVersion: String(current),
      apkUrl: (asset && asset.browser_download_url) || null,
      apkName: (asset && asset.name) || null,
      releaseUrl: (json && json.html_url) || null,
    };
  } catch {
    return null; // offline, a rate limit and so on
  }
}
