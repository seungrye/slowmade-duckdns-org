// The site's web-adventure content client - GET /api/web-adventure/content/v1 -> a {id: scene} map.
// The fetch and retry of webapp/src/lib/web-adventure/engine/sceneRegistry.ts, ported to the app (JS).
// Live fetch only (no offline support).

import { chooseRunVoice, DEFAULT_VOICE } from "./voice.js";

export const DEFAULT_API_BASE = "https://handmade.r-e.kr";

/** Kael's starting scene (the same as the site's sceneRegistry.START_SCENE_ID). */
export const START_SCENE_ID = "kael_infirmary";

const FETCH_RETRIES = 2;
const FETCH_BACKOFFS_MS = [500, 1500];

function resolveBase(baseUrl) {
  if (baseUrl) return baseUrl;
  // Vite: overridable through import.meta.env.VITE_API_BASE.
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
 * Submits the ending result to the app-only endpoint (/api/web-adventure/app-end-run) -> generating an AI feedback note.
 * Authenticated without a login, by a shared app key (x-app-key = VITE_APP_KEY). Failures are swallowed (play must not be blocked).
 * @param {object} payload {endingId, finalSceneId, scenePath, log, character}
 * @param {object} [opts] {appKey, baseUrl, fetchImpl}
 */
export async function submitAppEndRun(payload, opts = {}) {
  const key = opts.appKey || resolveAppKey();
  if (!key) return false; // No key injected (the build has no VITE_APP_KEY) -> nothing is sent.
  const baseUrl = resolveBase(opts.baseUrl);
  const fetchImpl = opts.fetchImpl || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);
  if (!fetchImpl) return false;
  try {
    const res = await fetchImpl(`${baseUrl}/api/web-adventure/app-end-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-app-key": key },
      body: JSON.stringify(payload),
    });
    // Success has to be returned so the retry queue knows when to drop an entry (#61).
    return Boolean(res && res.ok);
  } catch {
    return false; // A send failure is still swallowed - it does not block play.
  }
}

// The prose-style coverage from the last response (#87).
// The server strips variants from the scenes, so this value is the only way to tell which styles are complete.
let lastVoices = {};
// #103 - the item catalogue. It is not mirrored in the app; what the server gives is used (avoiding double maintenance).
let lastItems = {};
let lastInventoryCap = 8;

/** The per-style coverage reported by the last content fetch. An empty object before the fetch. */
export function getVoiceCoverage() {
  return lastVoices;
}

/** The item catalogue `{id: Item}` from the last content fetch. An empty object before the fetch. */
export function getItemCatalog() {
  return lastItems;
}

/** The inventory cap. 8 when the server gives none (the web's INVENTORY_CAP default). */
export function getInventoryCap() {
  return lastInventoryCap;
}

async function fetchOnce(baseUrl, fetchImpl, voice) {
  const qs = voice ? `?voice=${encodeURIComponent(voice)}` : "";
  const res = await fetchImpl(`${baseUrl}/api/web-adventure/content/v1${qs}`);
  if (!res.ok) throw new Error(`content fetch ${res.status}`);
  const json = await res.json();
  lastVoices = (json && json.data && json.data.voices) || {};
  lastItems = (json && json.data && json.data.items) || {};
  if (json && json.data && Number.isFinite(json.data.inventoryCap)) lastInventoryCap = json.data.inventoryCap;
  const list = (json && json.data && json.data.scenes) || [];
  const map = {};
  for (const s of list) {
    if (s && s.id) map[s.id] = s;
  }
  return map;
}

/**
 * Fetches the scene map.
 * @param {object} [opts]
 * @param {string} [opts.baseUrl] the API base (DEFAULT_API_BASE / VITE_API_BASE by default)
 * @param {function} [opts.fetchImpl] an injected fetch (for tests)
 * @param {boolean} [opts.retry=true] retry on failure
 * @param {number[]} [opts.backoffs] the retry backoffs (ms)
 * @param {string} [opts.voice] the prose style (#87). Unset, the default body.
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
 * Decides this run's prose style and fetches the scenes (#87).
 *
 * The server strips variants from the scenes, so which styles are complete cannot be told. It fetches once
 * to get the coverage, picks a style and, when that is not the default, fetches again in that style. The first load
 * can therefore make two requests, but the second usually hits the cache (the same approach as the web play screen).
 *
 * The chosen style is stored and **kept for the whole run** - a style that varies scene by scene breaks the immersion.
 *
 * @param {object} [opts] fetchScenes' options plus { storage, rnd, voice }
 * @returns {Promise<{scenes: Record<string, object>, voice: string}>}
 */
export async function fetchScenesForRun(opts = {}) {
  const first = await fetchScenes(opts);
  if (opts.voice) return { scenes: first, voice: opts.voice };

  // Why sessionStorage: closing and reopening the app should start with a new style.
  // With localStorage the style drawn once would be fixed forever and the randomness would mean nothing.
  // (The web play screen uses sessionStorage for the same reason.)
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
