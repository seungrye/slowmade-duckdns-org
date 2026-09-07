/**
 * A utility that dispatches a virtual key press as a real `KeyboardEvent`.
 *
 * Used by:
 *   - the mobile virtual keypad for the bevy-rogue WASM (winit) game.
 *   - passing input through browser KeyboardEvents alone, with no change to the game's code.
 *
 * How it works:
 *   - winit-web maps input by `code` and `keyCode`, so both are filled in before dispatching.
 *   - So it can be caught on `window` even without the canvas focused, the same event is issued through both
 *     `target.dispatchEvent` and `window.dispatchEvent`.
 *   - keyCode is deprecated but is still a fallback on some winit code paths, so it is filled in.
 */

/** Key -> `KeyboardEvent.code`. Only the keys the virtual keypad uses are registered. */
const CODE_MAP: Record<string, string> = {
  // letters
  w: "KeyW",
  a: "KeyA",
  s: "KeyS",
  d: "KeyD",
  e: "KeyE",
  j: "KeyJ",
  q: "KeyQ",
  t: "KeyT",
  y: "KeyY",
  f: "KeyF",
  // digits
  "1": "Digit1",
  "2": "Digit2",
  "3": "Digit3",
  // special
  " ": "Space",
  Enter: "Enter",
  Escape: "Escape",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  F1: "F1",
  F2: "F2",
};

/** Key -> `KeyboardEvent.keyCode` (deprecated, a fallback). */
const KEYCODE_MAP: Record<string, number> = {
  w: 87,
  a: 65,
  s: 83,
  d: 68,
  e: 69,
  j: 74,
  q: 81,
  t: 84,
  y: 89,
  f: 70,
  "1": 49,
  "2": 50,
  "3": 51,
  " ": 32,
  Enter: 13,
  Escape: 27,
  ArrowUp: 38,
  ArrowDown: 40,
  ArrowLeft: 37,
  ArrowRight: 39,
  F1: 112,
  F2: 113,
};

/** Key -> (code, keyCode) in one lookup. An unregistered key uses a safe fallback. */
export function resolveKeyMeta(key: string): { code: string; keyCode: number } {
  const code = CODE_MAP[key] ?? key;
  const keyCode = KEYCODE_MAP[key] ?? 0;
  return { code, keyCode };
}

/**
 * Dispatches a synthetic `KeyboardEvent` to the right target.
 *
 * Behaviour:
 *   - With a target, it dispatches there with `bubbles: true`, so it bubbles naturally up the DOM tree to
 *     document and window. It reaches winit-web even when that listens on window or document.
 *   - Without a target, it dispatches directly on window.
 *
 * The point is issuing it in one place only, so the same event never arrives twice.
 *
 * @param target the primary target (usually the `<canvas>`). `null` dispatches on window directly.
 * @param key the `KeyboardEvent.key` value ("w", "ArrowUp", "Enter", " ").
 * @param type "keydown" | "keyup".
 */
export function dispatchKey(
  target: HTMLElement | null,
  key: string,
  type: "keydown" | "keyup",
): void {
  const { code, keyCode } = resolveKeyMeta(key);
  const init: KeyboardEventInit & { keyCode?: number; which?: number } = {
    key,
    code,
    bubbles: true,
    cancelable: true,
    composed: true,
    // legacy fields - for winit's fallback path.
    keyCode,
    which: keyCode,
  };
  const ev = new KeyboardEvent(type, init);
  // Some browsers ignore keyCode/which in KeyboardEventInit, so defineProperty forces them.
  try {
    Object.defineProperty(ev, "keyCode", { get: () => keyCode });
    Object.defineProperty(ev, "which", { get: () => keyCode });
  } catch {
    // 이미 정의된 환경(jsdom 일부 버전)에서는 무시 — 위 init 값으로 충분.
  }

  if (target) {
    // Propagates naturally: target -> bubble -> document -> window.
    target.dispatchEvent(ev);
  } else {
    window.dispatchEvent(ev);
  }
}

/** Toggle-style keys - a keydown followed by a keyup after a short delay. */
export function tapKey(target: HTMLElement | null, key: string): void {
  dispatchKey(target, key, "keydown");
  // keyup immediately, in the same frame. winit only needs to see the down/up sequence.
  dispatchKey(target, key, "keyup");
}
