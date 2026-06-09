// typewriter-options — 플레이 옵션 (#351/v3) localStorage helper.
//
// 두 개 옵션:
//   1) 타이프라이터 효과 ON/OFF (`web-adventure:typewriter`)
//      - "off" 저장 시 모든 본문 즉시 표시.
//   2) 방문 씬 자동 skip ON/OFF (`web-adventure:typewriter-skip-visited`)
//      - "on" 저장 시 2 회 이상 진입한 씬 본문은 즉시 표시.
//      - 방문 기록: `web-adventure:visited-scenes` = JSON.stringify(string[])
//
// 모두 *옵셔널* — localStorage 미사용 / 에러 시 기본 동작 유지.
// 회차 누적 (= 다른 회차에서 본 씬) 의미는 localStorage 가 *세션 간 영속* 이라
// 자연스럽게 충족 — 별도 회차 단위 분리 없음.

const KEY_TYPEWRITER = "web-adventure:typewriter";
const KEY_SKIP_VISITED = "web-adventure:typewriter-skip-visited";
const KEY_VISITED_SCENES = "web-adventure:visited-scenes";

export function getTypewriterEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(KEY_TYPEWRITER) !== "off";
  } catch {
    return true;
  }
}

export function setTypewriterEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) {
      window.localStorage.removeItem(KEY_TYPEWRITER);
    } else {
      window.localStorage.setItem(KEY_TYPEWRITER, "off");
    }
  } catch {
    /* 무시 */
  }
}

export function getSkipVisitedEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY_SKIP_VISITED) === "on";
  } catch {
    return false;
  }
}

export function setSkipVisitedEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) {
      window.localStorage.setItem(KEY_SKIP_VISITED, "on");
    } else {
      window.localStorage.removeItem(KEY_SKIP_VISITED);
    }
  } catch {
    /* 무시 */
  }
}

/** 방문한 씬 id Set — JSON 파싱 실패 시 빈 Set. */
export function getVisitedScenes(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY_VISITED_SCENES);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

export function isSceneVisited(sceneId: string): boolean {
  return getVisitedScenes().has(sceneId);
}

/** 방문 기록 추가 — id 중복 시 no-op. */
export function markSceneVisited(sceneId: string): void {
  if (typeof window === "undefined") return;
  const visited = getVisitedScenes();
  if (visited.has(sceneId)) return;
  visited.add(sceneId);
  try {
    window.localStorage.setItem(
      KEY_VISITED_SCENES,
      JSON.stringify(Array.from(visited)),
    );
  } catch {
    /* 무시 */
  }
}

/** 디버그/테스트용 — 방문 기록 초기화. */
export function clearVisitedScenes(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY_VISITED_SCENES);
  } catch {
    /* 무시 */
  }
}
