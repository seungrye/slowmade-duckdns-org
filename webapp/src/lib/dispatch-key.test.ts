// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dispatchKey, resolveKeyMeta, tapKey } from "./dispatch-key";

describe("resolveKeyMeta — 등록된 키는 code/keyCode 정상 매핑", () => {
  it("WASD 이동 키는 KeyW/KeyA/KeyS/KeyD 코드로 매핑된다", () => {
    expect(resolveKeyMeta("w")).toEqual({ code: "KeyW", keyCode: 87 });
    expect(resolveKeyMeta("a")).toEqual({ code: "KeyA", keyCode: 65 });
    expect(resolveKeyMeta("s")).toEqual({ code: "KeyS", keyCode: 83 });
    expect(resolveKeyMeta("d")).toEqual({ code: "KeyD", keyCode: 68 });
  });

  it("Space 와 Enter 와 Escape 의 code/keyCode 가 정확하다", () => {
    expect(resolveKeyMeta(" ")).toEqual({ code: "Space", keyCode: 32 });
    expect(resolveKeyMeta("Enter")).toEqual({ code: "Enter", keyCode: 13 });
    expect(resolveKeyMeta("Escape")).toEqual({ code: "Escape", keyCode: 27 });
  });

  it("F1/F2 기능 키의 keyCode 는 112/113", () => {
    expect(resolveKeyMeta("F1")).toEqual({ code: "F1", keyCode: 112 });
    expect(resolveKeyMeta("F2")).toEqual({ code: "F2", keyCode: 113 });
  });

  it("등록되지 않은 키는 폴백으로 code=key, keyCode=0", () => {
    expect(resolveKeyMeta("ZZZ")).toEqual({ code: "ZZZ", keyCode: 0 });
  });
});

describe("dispatchKey — target 에 발행하면 자연 버블링으로 window 까지 도달", () => {
  let target: HTMLDivElement;
  let windowSpy: ReturnType<typeof vi.fn>;
  let targetSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);

    targetSpy = vi.fn();
    windowSpy = vi.fn();

    target.addEventListener("keydown", targetSpy as EventListener);
    target.addEventListener("keyup", targetSpy as EventListener);
    window.addEventListener("keydown", windowSpy as EventListener);
    window.addEventListener("keyup", windowSpy as EventListener);
  });

  afterEach(() => {
    target.remove();
    window.removeEventListener("keydown", windowSpy as EventListener);
    window.removeEventListener("keyup", windowSpy as EventListener);
  });

  it("target 과 window 둘 다 keydown 이벤트를 한 번씩만 받는다", () => {
    dispatchKey(target, "w", "keydown");
    expect(targetSpy).toHaveBeenCalledTimes(1);
    expect(windowSpy).toHaveBeenCalledTimes(1);
  });

  it("dispatch 된 이벤트의 key/code 가 자료와 일치한다", () => {
    dispatchKey(target, "ArrowUp", "keydown");
    const evt = windowSpy.mock.calls[0][0] as KeyboardEvent;
    expect(evt.key).toBe("ArrowUp");
    expect(evt.code).toBe("ArrowUp");
    expect(evt.type).toBe("keydown");
  });

  it("target 이 null 이어도 window 에는 이벤트가 발행된다", () => {
    dispatchKey(null, "Escape", "keyup");
    expect(targetSpy).not.toHaveBeenCalled();
    expect(windowSpy).toHaveBeenCalledTimes(1);
    const evt = windowSpy.mock.calls[0][0] as KeyboardEvent;
    expect(evt.type).toBe("keyup");
    expect(evt.key).toBe("Escape");
  });

  it("keydown 과 keyup 은 동일한 key 로 별도 이벤트로 발행된다", () => {
    dispatchKey(target, "e", "keydown");
    dispatchKey(target, "e", "keyup");
    expect(targetSpy).toHaveBeenCalledTimes(2);
    expect(windowSpy).toHaveBeenCalledTimes(2);
    expect((windowSpy.mock.calls[0][0] as KeyboardEvent).type).toBe("keydown");
    expect((windowSpy.mock.calls[1][0] as KeyboardEvent).type).toBe("keyup");
  });
});

describe("tapKey — keydown→keyup 한 쌍을 즉시 발행", () => {
  it("동일 key 로 keydown 과 keyup 이 순서대로 발행된다", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const spy = vi.fn();
    window.addEventListener("keydown", spy as EventListener);
    window.addEventListener("keyup", spy as EventListener);

    tapKey(target, "F2");

    expect(spy).toHaveBeenCalledTimes(2);
    const types = spy.mock.calls.map((c) => (c[0] as KeyboardEvent).type);
    expect(types).toEqual(["keydown", "keyup"]);
    const keys = spy.mock.calls.map((c) => (c[0] as KeyboardEvent).key);
    expect(keys).toEqual(["F2", "F2"]);

    window.removeEventListener("keydown", spy as EventListener);
    window.removeEventListener("keyup", spy as EventListener);
    target.remove();
  });
});
