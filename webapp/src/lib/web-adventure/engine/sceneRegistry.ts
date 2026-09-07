// The scene registry - a mongo fetch as the single source (the #253 refresh).
//
// The content was replaced entirely by The Fall of Eternia, so the static import fallback was removed.
// Only Phase D's getScenes() and resetSceneCache() remain - the client fetches scenes from
// /api/web-adventure/content/v1.
//
// For compatibility with scenarios.test.ts and the static fallback (Phase D), an empty `scenes` object and
// `START_SCENE_ID` are still exported (backup: scripts/backups/web-adventure-pre-aethernia-*.json).

import type { SceneRegistry } from "@/types/web-adventure";
import type { Coverage } from "../voice";

/** The static fallback - empty after the content refresh (mongo is the single source). */
export const scenes: SceneRegistry = {};

/** Kael's starting scene. Rin and Solwen use their own startScene at character creation. */
export const START_SCENE_ID = "kael_infirmary";

// ── Phase D's dynamic fetch (mongo-based) ───────────────────────────────────────────
let cachedScenes: SceneRegistry | null = null;
let cachedVoice = ""; // which prose style the cache was fetched for (#73)
let inflight: Promise<SceneRegistry> | null = null;

export interface GetScenesOptions {
  /** true ignores the cache and fetches again. */
  force?: boolean;
  /** false disables retrying (a single fetch). true by default (#292). */
  retry?: boolean;
  /** The prose style (#73). Unset gives the default style. A changed value invalidates the cache. */
  voice?: string;
}

// #292 - the retry policy for a transient network failure.
//   A failed initial fetch is tried twice more (500ms then 1500ms backoff). It throws only when all fail.
//   Stable in operation, with page.tsx's "retry" button as *manual* extra protection on failure.
const FETCH_RETRIES = 2;
const FETCH_BACKOFFS_MS = [500, 1500];

// The prose-style coverage from the last response (#79).
// The scenes the client receives have their variants stripped, so completeness cannot be told from them.
// Choosing a random style needs this value, so it is kept separately from the response.
let lastVoices: Record<string, Coverage> = {};

/** The per-style coverage the last content fetch reported. An empty object before any fetch. */
export function getVoiceCoverage(): Record<string, Coverage> {
  return lastVoices;
}

async function fetchContentOnce(voice?: string): Promise<SceneRegistry> {
  const qs = voice ? `?voice=${encodeURIComponent(voice)}` : "";
  const res = await fetch(`/api/web-adventure/content/v1${qs}`);
  if (!res.ok) throw new Error(`content fetch ${res.status}`);
  const json = (await res.json()) as {
    success?: boolean;
    data?: {
      scenes?: Array<{ id: string } & Record<string, unknown>>;
      voices?: Record<string, Coverage>;
    };
  };
  lastVoices = json?.data?.voices ?? {};
  const list = json?.data?.scenes ?? [];
  const map: SceneRegistry = {};
  for (const s of list) {
    map[s.id] = s as SceneRegistry[string];
  }
  return map;
}

/** Fetches the scenes from /api/web-adventure/content/v1 (a module cache, an in-flight singleton and retries). */
export async function getScenes(opts: GetScenesOptions = {}): Promise<SceneRegistry> {
  const voice = opts.voice ?? "";
  // A changed style changes every body, so neither the cache nor an in-flight request is reused.
  if (!opts.force && cachedScenes && cachedVoice === voice) return cachedScenes;
  if (inflight && cachedVoice === voice) return inflight;

  const retry = opts.retry !== false;
  cachedVoice = voice;
  inflight = (async () => {
    try {
      if (!retry) {
        const map = await fetchContentOnce(voice);
        cachedScenes = map;
        return map;
      }
      let lastError: unknown = null;
      for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
        try {
          const map = await fetchContentOnce(voice);
          cachedScenes = map;
          return map;
        } catch (err) {
          lastError = err;
          if (attempt < FETCH_RETRIES) {
            await new Promise((r) => setTimeout(r, FETCH_BACKOFFS_MS[attempt] ?? 1500));
          }
        }
      }
      throw lastError instanceof Error ? lastError : new Error("content fetch failed");
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** For tests and forced refreshes - clears the module cache. */
export function resetSceneCache(): void {
  cachedScenes = null;
  cachedVoice = "";
  inflight = null;
  lastVoices = {};
}
