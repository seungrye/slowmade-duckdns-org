// 앱 시작 시 GitHub 최신 릴리스와 현재 버전을 비교해 업데이트를 안내한다.
//
// 설치까지 앱이 직접 하려면 REQUEST_INSTALL_PACKAGES 권한과 FileProvider 가 필요해
// 범위가 커진다. 여기서는 "확인 → 사용자 컨펌 → 다운로드 열기" 까지만 한다.
//
// 확인 실패(오프라인·API rate limit 등)는 삼킨다 — 업데이트 때문에 게임이 막히면 안 된다.
// content-client 의 submitAppEndRun 과 같은 정책.

export const REPO = "seungrye/slowmade-duckdns-org";

/** "v1.0.13" | "1.0.13" → [1,0,13]. 숫자가 아닌 조각은 0. */
export function parseVersion(v) {
  return String(v ?? "")
    .replace(/^v/i, "")
    .split(".")
    .map((p) => {
      const n = parseInt(p, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

/** latest 가 current 보다 높은가. 문자열이 아니라 자리별 숫자로 비교한다(10 > 9). */
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

/** 서명본(app-release.apk) 우선 — 디버그본과 서명이 달라 덮어쓸 수 없기 때문. */
export function pickApkAsset(assets) {
  const list = Array.isArray(assets) ? assets : [];
  return (
    list.find((a) => /release\.apk$/i.test((a && a.name) || "")) ||
    list.find((a) => /\.apk$/i.test((a && a.name) || "")) ||
    null
  );
}

/** 빌드 시 주입된 버전(VITE_APP_VERSION). 로컬 개발 빌드엔 없다. */
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
 *          최신이거나 확인 불가면 null.
 */
export async function checkForUpdate(opts = {}) {
  const current =
    opts.currentVersion !== undefined ? opts.currentVersion : resolveCurrentVersion();
  if (!current) return null; // 비교 기준이 없으면(개발 빌드) 확인하지 않는다.

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
    return null; // 오프라인·rate limit 등
  }
}
