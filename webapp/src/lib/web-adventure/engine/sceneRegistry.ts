// 씬 레지스트리 — 단일 객체 lookup 으로 reducer 가 씬을 찾는다.
//
// Phase D:
//   - 정적 import + `scenes` export 는 *유지* (마이그레이션 스크립트 / scenarios.test.ts /
//     fallback 안전성 확보 용도). Phase E 후 제거 여부 재검토.
//   - 신규 `getScenes()` 는 /api/web-adventure/content/v1 을 fetch 하여 mongo 컨텐츠를
//     SceneRegistry 로 반환한다. 모듈-level 캐시 + inflight Promise 싱글톤으로
//     동시 호출을 단일 fetch 로 합친다.
//   - `resetSceneCache()` 는 테스트 / 강제 새로고침 헬퍼.

import type { Scene, SceneRegistry } from "@/types/web-adventure";
import { townSquareDawn } from "@/content/web-adventure/scenes/town_square_dawn";
import { marketMorning } from "@/content/web-adventure/scenes/market_morning";
import { marketBuy } from "@/content/web-adventure/scenes/market_buy";
import { marketStorageSuccess } from "@/content/web-adventure/scenes/market_storage_success";
import { marketCaught } from "@/content/web-adventure/scenes/market_caught";
import { elderHouseArrival } from "@/content/web-adventure/scenes/elder_house_arrival";
import { forestEntry } from "@/content/web-adventure/scenes/forest_entry";
import { forestLost } from "@/content/web-adventure/scenes/forest_lost";
import { forestInner } from "@/content/web-adventure/scenes/forest_inner";
import { forestInnerWithGlasses } from "@/content/web-adventure/scenes/forest_inner_with_glasses";
import { forestFindGlasses } from "@/content/web-adventure/scenes/forest_find_glasses";
import { caveEntry } from "@/content/web-adventure/scenes/cave_entry";
import { caveInside } from "@/content/web-adventure/scenes/cave_inside";
import { caveAfterSpellbook } from "@/content/web-adventure/scenes/cave_after_spellbook";
import { goblinEncounter } from "@/content/web-adventure/scenes/goblin_encounter";
import { endingMain } from "@/content/web-adventure/scenes/ending_main";
import { endingSpirit } from "@/content/web-adventure/scenes/ending_spirit";
import { endingGoblinFriend } from "@/content/web-adventure/scenes/ending_goblin_friend";

export const scenes: SceneRegistry = {
  [townSquareDawn.id]: townSquareDawn,
  [marketMorning.id]: marketMorning,
  [marketBuy.id]: marketBuy,
  [marketStorageSuccess.id]: marketStorageSuccess,
  [marketCaught.id]: marketCaught,
  [elderHouseArrival.id]: elderHouseArrival,
  [forestEntry.id]: forestEntry,
  [forestLost.id]: forestLost,
  [forestInner.id]: forestInner,
  [forestInnerWithGlasses.id]: forestInnerWithGlasses,
  [forestFindGlasses.id]: forestFindGlasses,
  [caveEntry.id]: caveEntry,
  [caveInside.id]: caveInside,
  [caveAfterSpellbook.id]: caveAfterSpellbook,
  [goblinEncounter.id]: goblinEncounter,
  [endingMain.id]: endingMain,
  [endingSpirit.id]: endingSpirit,
  [endingGoblinFriend.id]: endingGoblinFriend,
};

export const START_SCENE_ID = townSquareDawn.id;

// ──────────────────────────────────────────────────────────────────────────
// 동적 fetch + 캐시 (Phase D)
// ──────────────────────────────────────────────────────────────────────────

export const SCENES_CONTENT_URL = "/api/web-adventure/content/v1";

/** mongo 배열 형식 (Scene[]) → SceneRegistry (id 키 객체) 변환 헬퍼. */
export function mongoArrayToRegistry(docs: Scene[]): SceneRegistry {
  const registry: SceneRegistry = {};
  for (const doc of docs) {
    if (doc && typeof doc.id === "string") {
      registry[doc.id] = doc;
    }
  }
  return registry;
}

let cachedRegistry: SceneRegistry | null = null;
let inflight: Promise<SceneRegistry> | null = null;

/**
 * 테스트 / 강제 무효화용 헬퍼. 캐시와 inflight Promise 를 모두 해제한다.
 *
 * 주의: production 코드 흐름에서는 `getScenes({ force: true })` 사용을 권장한다.
 */
export function resetSceneCache(): void {
  cachedRegistry = null;
  inflight = null;
}

/**
 * mongo (`/api/web-adventure/content/v1`) 에서 전 씬을 가져와 SceneRegistry 로 반환.
 *
 * - 첫 호출 후 모듈-level 에 캐시. 이후 호출은 동기 Promise.resolve.
 * - 동시 호출 시 inflight Promise 를 공유하여 fetch 는 1 회만 발생.
 * - HTTP 4xx/5xx 응답은 throw — 호출자는 UI 에 에러 표시 + 재시도 트리거.
 * - fetch reject 시 inflight 해제 → 다음 호출에서 재시도 가능.
 * - `{ force: true }` 는 캐시 + inflight 를 모두 해제하고 새로 fetch.
 */
export async function getScenes(opts?: {
  force?: boolean;
}): Promise<SceneRegistry> {
  if (opts?.force) {
    cachedRegistry = null;
    inflight = null;
  }

  if (cachedRegistry) {
    return cachedRegistry;
  }
  if (inflight) {
    return inflight;
  }

  inflight = (async () => {
    const res = await fetch(SCENES_CONTENT_URL);
    if (!res.ok) {
      throw new Error(`scenes fetch ${res.status}`);
    }
    const json = (await res.json()) as
      | { success?: boolean; data?: { scenes?: Scene[] }; scenes?: Scene[] }
      | undefined;
    // 응답 형식 호환: { data: { scenes } } (실제 API) / { scenes } (테스트 편의).
    const list: Scene[] =
      json?.data?.scenes ?? json?.scenes ?? [];
    const registry = mongoArrayToRegistry(list);
    cachedRegistry = registry;
    return registry;
  })();

  try {
    const result = await inflight;
    return result;
  } catch (err) {
    // fetch 실패 시 inflight 만 해제 (캐시는 애초에 없음) — 다음 호출 재시도 가능.
    inflight = null;
    throw err;
  } finally {
    // 성공 후에도 inflight 는 더 이상 필요 없음 — 캐시가 hit 한다.
    if (cachedRegistry) {
      inflight = null;
    }
  }
}
