// 사이트 web-adventure 콘텐츠 클라이언트 — GET /api/web-adventure/content/v1 → {id: scene} 맵.
// webapp/src/lib/web-adventure/engine/sceneRegistry.ts 의 fetch+retry 를 앱(JS)으로 이식.
// 실시간 fetch 전용(오프라인 미지원).

import { chooseRunVoice, DEFAULT_VOICE } from "./voice.js";

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
  if (!key) return false; // 키 미주입(빌드에 VITE_APP_KEY 없음) → 미전송.
  const baseUrl = resolveBase(opts.baseUrl);
  const fetchImpl = opts.fetchImpl || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);
  if (!fetchImpl) return false;
  try {
    const res = await fetchImpl(`${baseUrl}/api/web-adventure/app-end-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-app-key": key },
      body: JSON.stringify(payload),
    });
    // 성공 여부를 돌려줘야 재시도 큐가 언제 지울지 판단할 수 있다(#61).
    return Boolean(res && res.ok);
  } catch {
    return false; // 전송 실패는 여전히 삼킨다 — 플레이를 막지 않는다.
  }
}

// 마지막 응답의 문체 커버리지 (#87).
// 서버는 씬에서 variants 를 떼고 보내므로, 어떤 문체가 완비인지는 이 값으로만 알 수 있다.
let lastVoices = {};

/** 마지막 content fetch 가 알려 준 문체별 커버리지. fetch 전에는 빈 객체. */
export function getVoiceCoverage() {
  return lastVoices;
}

async function fetchOnce(baseUrl, fetchImpl, voice) {
  const qs = voice ? `?voice=${encodeURIComponent(voice)}` : "";
  const res = await fetchImpl(`${baseUrl}/api/web-adventure/content/v1${qs}`);
  if (!res.ok) throw new Error(`content fetch ${res.status}`);
  const json = await res.json();
  lastVoices = (json && json.data && json.data.voices) || {};
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
 * @param {string} [opts.voice] 문체(#87). 미지정이면 기본 본문.
 * @returns {Promise<Record<string, object>>} {sceneId: Scene}
 */
export async function fetchScenes(opts = {}) {
  const baseUrl = resolveBase(opts.baseUrl);
  const fetchImpl = opts.fetchImpl || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);
  if (!fetchImpl) throw new Error("fetch unavailable");
  const retry = opts.retry !== false;
  const backoffs = opts.backoffs || FETCH_BACKOFFS_MS;

  const voice = opts.voice;
  if (!retry) return fetchOnce(baseUrl, fetchImpl, voice);

  let lastError = null;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    try {
      return await fetchOnce(baseUrl, fetchImpl, voice);
    } catch (err) {
      lastError = err;
      if (attempt < FETCH_RETRIES) {
        await new Promise((r) => setTimeout(r, backoffs[attempt] != null ? backoffs[attempt] : 1500));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("content fetch failed");
}

/**
 * 이번 판에 쓸 문체를 정해 씬을 받아온다 (#87).
 *
 * 서버는 씬에서 variants 를 떼고 보내므로 어떤 문체가 완비인지 알 수 없다. 그래서 우선 한 번
 * 받아 커버리지를 확보한 뒤 문체를 고르고, 기본이 아니면 그 문체로 다시 받는다. 첫 로드에
 * 요청이 두 번 나갈 수 있으나 대개 캐시에 걸린다(웹 플레이 화면과 같은 방식).
 *
 * 고른 문체는 저장해 **한 판 내내 유지**한다 — 씬마다 문체가 갈리면 몰입이 깨진다.
 *
 * @param {object} [opts] fetchScenes 의 옵션 + { storage, rnd, voice }
 * @returns {Promise<{scenes: Record<string, object>, voice: string}>}
 */
export async function fetchScenesForRun(opts = {}) {
  const first = await fetchScenes(opts);
  if (opts.voice) return { scenes: first, voice: opts.voice };

  // sessionStorage 를 쓰는 이유: 앱을 껐다 켜면 새 문체로 시작하게 하려는 것이다.
  // localStorage 였다면 한 번 뽑힌 문체가 영원히 고정돼 랜덤의 의미가 없어진다.
  // (웹 플레이 화면도 같은 이유로 sessionStorage 를 쓴다)
  const storage =
    opts.storage ||
    (typeof sessionStorage !== "undefined" ? sessionStorage : undefined);
  const voice = chooseRunVoice({
    coverage: getVoiceCoverage(),
    storage,
    rnd: opts.rnd,
  });
  if (voice === DEFAULT_VOICE) return { scenes: first, voice };

  const scenes = await fetchScenes({ ...opts, voice });
  return { scenes, voice };
}
