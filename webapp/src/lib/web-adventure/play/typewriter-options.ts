// typewriter-options - the localStorage helper for the play options (#351/v3).
//
// Two options:
//   1) the typewriter effect on/off (`web-adventure:typewriter`)
//      - stored as "off", every body appears at once.
//   2) automatically skipping visited scenes on/off (`web-adventure:typewriter-skip-visited`)
//      - stored as "on", a scene entered twice or more appears at once.
//      - the visit record: `web-adventure:visited-scenes` = JSON.stringify(string[])
//
// Both are *optional* - without localStorage, or on an error, the default behaviour stands.
// "Across runs" (scenes seen in another run) follows naturally from localStorage being *persistent between
// sessions* - there is no separate per-run split.

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

/** The set of visited scene ids - an empty Set when the JSON fails to parse. */
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

/** Adds to the visit record - a no-op for a duplicate id. */
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

/** For debugging and tests - clears the visit record. */
export function clearVisitedScenes(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY_VISITED_SCENES);
  } catch {
    /* 무시 */
  }
}
