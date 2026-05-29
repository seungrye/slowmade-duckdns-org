/**
 * 가상 키 입력 → 실제 `KeyboardEvent` dispatch 유틸.
 *
 * 사용처:
 *   - bevy-rogue WASM (winit) 게임용 모바일 가상 키패드.
 *   - 게임 코드 변경 없이 브라우저 KeyboardEvent 로만 입력 전달.
 *
 * 동작 원리:
 *   - winit-web 은 `code`/`keyCode` 로 입력을 매핑하므로 둘 다 채워서 dispatch.
 *   - 캔버스에 포커스가 가있지 않아도 `window` 에서 잡을 수 있도록
 *     `target.dispatchEvent` + `window.dispatchEvent` 양쪽으로 동일 이벤트를 발행.
 *   - keyCode 는 deprecated 지만 winit 의 일부 코드 경로에서 fallback 으로 쓰이므로 채운다.
 */

/** 키 → `KeyboardEvent.code` 매핑. 가상 키패드에서 쓰는 키만 등록. */
const CODE_MAP: Record<string, string> = {
  // 알파벳
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
  // 숫자
  "1": "Digit1",
  "2": "Digit2",
  "3": "Digit3",
  // 특수
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

/** 키 → `KeyboardEvent.keyCode` (deprecated, fallback). */
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

/** 키 → (code, keyCode) 한 번에 조회. 등록 안 된 키는 안전한 폴백 사용. */
export function resolveKeyMeta(key: string): { code: string; keyCode: number } {
  const code = CODE_MAP[key] ?? key;
  const keyCode = KEYCODE_MAP[key] ?? 0;
  return { code, keyCode };
}

/**
 * 합성 `KeyboardEvent` 를 적절한 타겟에 dispatch.
 *
 * 동작:
 *   - target 이 있으면 target 에 `bubbles: true` 로 dispatch → DOM 트리를 타고
 *     document/window 까지 자연 버블링. winit-web 이 window/document 에 붙어 있어도 도달.
 *   - target 이 없으면 window 에 직접 dispatch.
 *
 * 같은 이벤트가 두 번 들어가지 않도록 한 곳에만 발행하는 것이 핵심.
 *
 * @param target 1차 대상 (보통 `<canvas>`). `null` 이면 window 에 직접 발행.
 * @param key `KeyboardEvent.key` 값 (예 "w", "ArrowUp", "Enter", " ").
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
    // legacy fields — winit fallback 경로 대비.
    keyCode,
    which: keyCode,
  };
  const ev = new KeyboardEvent(type, init);
  // 일부 브라우저는 KeyboardEventInit 의 keyCode/which 를 무시 → defineProperty 로 강제.
  try {
    Object.defineProperty(ev, "keyCode", { get: () => keyCode });
    Object.defineProperty(ev, "which", { get: () => keyCode });
  } catch {
    // 이미 정의된 환경(jsdom 일부 버전)에서는 무시 — 위 init 값으로 충분.
  }

  if (target) {
    // target → bubble → document → window 순으로 자연 전파.
    target.dispatchEvent(ev);
  } else {
    window.dispatchEvent(ev);
  }
}

/** 토글류 키 — keydown → 짧은 지연 후 keyup 한 쌍. */
export function tapKey(target: HTMLElement | null, key: string): void {
  dispatchKey(target, key, "keydown");
  // 같은 프레임 내 즉시 keyup. winit 은 down/up 시퀀스만 보면 동작.
  dispatchKey(target, key, "keyup");
}
