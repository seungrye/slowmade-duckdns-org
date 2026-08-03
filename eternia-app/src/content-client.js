// 사이트 web-adventure 콘텐츠 클라이언트 — GET /api/web-adventure/content/v1 → {id: scene} 맵.
// webapp/src/lib/web-adventure/engine/sceneRegistry.ts 의 fetch+retry 를 앱(JS)으로 이식.
// 실시간 fetch 전용(오프라인 미지원).

export const DEFAULT_API_BASE = "https://handmade.r-e.kr";

/** Kael 의 시작 씬(사이트 sceneRegistry.START_SCENE_ID 와 동일). */
export const START_SCENE_ID = "kael_infirmary";

const FETCH_RETRIES = 2;
const FETCH_BACKOFFS_MS = [500, 1500];

function resolveBase(baseUrl) {
  if (baseUrl) return baseUrl;
  // Vite: import.meta.env.VITE_API_BASE 로 override 가능.
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) {
      return import.meta.env.VITE_API_BASE;
    }
  } catch {
    /* import.meta 미지원 환경 무시 */
  }
  return DEFAULT_API_BASE;
}

function resolveAppKey() {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_APP_KEY) {
      return import.meta.env.VITE_APP_KEY;
    }
  } catch {
    /* import.meta 미지원 무시 */
  }
  return "";
}

/**
 * 엔딩 결과를 앱 전용 엔드포인트(/api/web-adventure/app-end-run)로 제출 → AI 피드백 노트 생성.
 * 로그인 없이 공유 앱 키(x-app-key = VITE_APP_KEY)로 인증. 실패는 삼킨다(플레이 방해 금지).
 * @param {object} payload {endingId, finalSceneId, scenePath, log, character}
 * @param {object} [opts] {appKey, baseUrl, fetchImpl}
 */
export async function submitAppEndRun(payload, opts = {}) {
  const key = opts.appKey || resolveAppKey();
  if (!key) return; // 키 미주입(빌드에 VITE_APP_KEY 없음) → 미전송.
  const baseUrl = resolveBase(opts.baseUrl);
  const fetchImpl = opts.fetchImpl || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);
  if (!fetchImpl) return;
  try {
    await fetchImpl(`${baseUrl}/api/web-adventure/app-end-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-app-key": key },
      body: JSON.stringify(payload),
    });
  } catch {
    /* 전송 실패 삼킴 */
  }
}

async function fetchOnce(baseUrl, fetchImpl) {
  const res = await fetchImpl(`${baseUrl}/api/web-adventure/content/v1`);
  if (!res.ok) throw new Error(`content fetch ${res.status}`);
  const json = await res.json();
  const list = (json && json.data && json.data.scenes) || [];
  const map = {};
  for (const s of list) {
    if (s && s.id) map[s.id] = s;
  }
  return map;
}

/**
 * 씬 맵 fetch.
 * @param {object} [opts]
 * @param {string} [opts.baseUrl] API 베이스(기본 DEFAULT_API_BASE / VITE_API_BASE)
 * @param {function} [opts.fetchImpl] 주입형 fetch(테스트)
 * @param {boolean} [opts.retry=true] 실패 시 재시도
 * @param {number[]} [opts.backoffs] 재시도 backoff(ms)
 * @returns {Promise<Record<string, object>>} {sceneId: Scene}
 */
export async function fetchScenes(opts = {}) {
  const baseUrl = resolveBase(opts.baseUrl);
  const fetchImpl = opts.fetchImpl || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);
  if (!fetchImpl) throw new Error("fetch unavailable");
  const retry = opts.retry !== false;
  const backoffs = opts.backoffs || FETCH_BACKOFFS_MS;

  if (!retry) return fetchOnce(baseUrl, fetchImpl);

  let lastError = null;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    try {
      return await fetchOnce(baseUrl, fetchImpl);
    } catch (err) {
      lastError = err;
      if (attempt < FETCH_RETRIES) {
        await new Promise((r) => setTimeout(r, backoffs[attempt] != null ? backoffs[attempt] : 1500));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("content fetch failed");
}
