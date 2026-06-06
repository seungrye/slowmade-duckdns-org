// 씬 레지스트리 — mongo fetch 단일 소스 (#253 리프래시).
//
// 〈에테르니아의 추락〉 으로 콘텐츠가 완전 교체되어 정적 import fallback 은 제거.
// Phase D 의 getScenes() / resetSceneCache() 만 유지 — 클라이언트는 /api/web-adventure/content/v1
// 에서 씬을 fetch.
//
// scenarios.test.ts 와 정적 fallback (Phase D) 호환 위해 빈 `scenes` 객체와
// `START_SCENE_ID` 는 export 유지 (백업: scripts/backups/web-adventure-pre-aethernia-*.json).

import type { SceneRegistry } from "@/types/web-adventure";

/** 정적 fallback — 콘텐츠 리프래시 후 비어 있음 (mongo 가 단일 소스). */
export const scenes: SceneRegistry = {};

/** Kael 의 시작 씬. Rin/Solwen 은 캐릭터 생성 시 별도 startScene 사용. */
export const START_SCENE_ID = "kael_infirmary";

// ── Phase D 동적 fetch (mongo 기반) ───────────────────────────────────────────
let cachedScenes: SceneRegistry | null = null;
let inflight: Promise<SceneRegistry> | null = null;

export interface GetScenesOptions {
  /** true 면 캐시 무시하고 다시 fetch. */
  force?: boolean;
  /** false 면 retry 비활성 (단일 fetch). 기본 true (#292). */
  retry?: boolean;
}

// #292 — 일시 네트워크 fail 대응 retry 정책.
//   초기 fetch 실패 시 2 회 더 시도 (500ms / 1500ms backoff). 모두 실패해야 throw.
//   안정적 운영 + 실패 시 page.tsx 의 "재시도" 버튼이 *수동* 추가 보호.
const FETCH_RETRIES = 2;
const FETCH_BACKOFFS_MS = [500, 1500];

async function fetchContentOnce(): Promise<SceneRegistry> {
  const res = await fetch("/api/web-adventure/content/v1");
  if (!res.ok) throw new Error(`content fetch ${res.status}`);
  const json = (await res.json()) as {
    success?: boolean;
    data?: { scenes?: Array<{ id: string } & Record<string, unknown>> };
  };
  const list = json?.data?.scenes ?? [];
  const map: SceneRegistry = {};
  for (const s of list) {
    map[s.id] = s as SceneRegistry[string];
  }
  return map;
}

/** /api/web-adventure/content/v1 에서 씬을 fetch (모듈 캐시 + inflight 싱글톤 + retry). */
export async function getScenes(opts: GetScenesOptions = {}): Promise<SceneRegistry> {
  if (!opts.force && cachedScenes) return cachedScenes;
  if (inflight) return inflight;

  const retry = opts.retry !== false;
  inflight = (async () => {
    try {
      if (!retry) {
        const map = await fetchContentOnce();
        cachedScenes = map;
        return map;
      }
      let lastError: unknown = null;
      for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
        try {
          const map = await fetchContentOnce();
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

/** 테스트/강제 새로고침 — 모듈 캐시 초기화. */
export function resetSceneCache(): void {
  cachedScenes = null;
  inflight = null;
}
