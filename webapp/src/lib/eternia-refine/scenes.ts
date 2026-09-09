'use client';

// CYOA 씬 받아 오기 (#432).
//
// 덱빌더가 〈에테르니아의 추락〉의 씬을 지도로 쓰려면 그것을 어디선가 받아야 한다.
// `/api/web-adventure/content/v1` 이 **공개**라(실측 200) 앱 키도 로그인도 필요 없다.
//
// ── 못 받아도 게임은 돈다 ───────────────────────────────────────────
//
// 이 fetch 가 이번 변경이 들여오는 **유일한 바깥 의존**이다. 오프라인이거나 API 가 죽으면
// 이야기는 못 얹지만, 그렇다고 게임이 안 되면 안 된다. 실패하면 조용히 `null` 을 돌려주고
// 부르는 쪽이 절차 생성 지도(`map.ts`)로 물러선다.
//
// 한 번 받으면 들고 있는다 — 회차마다 3막이 지도를 만드는데 매번 받을 이유가 없다.

import type { ScenarioScene } from './scenario';

const URL = '/api/web-adventure/content/v1';

let cache: ScenarioScene[] | null = null;
let inflight: Promise<ScenarioScene[] | null> | null = null;

/**
 * 씬을 받아 온다. **실패는 조용하다** — null 이면 부르는 쪽이 폴백한다.
 *
 * 같은 요청이 겹치면 하나로 합친다(화면이 여러 번 부를 수 있다).
 */
export async function loadScenes(): Promise<ScenarioScene[] | null> {
  if (cache !== null) return cache;
  if (inflight !== null) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(URL, { cache: 'force-cache' });
      if (!res.ok) return null;
      const json = (await res.json()) as { data?: { scenes?: ScenarioScene[] } };
      const scenes = json?.data?.scenes;
      if (!Array.isArray(scenes) || scenes.length === 0) return null;
      cache = scenes;
      return scenes;
    } catch {
      // 오프라인·장애 — 이야기 없이 간다.
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** 시험이 캐시를 비울 자리. 실행 중에는 부를 일이 없다. */
export function __resetSceneCache(): void {
  cache = null;
  inflight = null;
}
