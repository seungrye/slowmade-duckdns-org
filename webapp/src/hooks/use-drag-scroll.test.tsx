// Turning a vertical wheel into horizontal scrolling (#41 - so a clipped icon can be reached when the editor toolbar overflows).
// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { useWheelScrollX, useDragScrollX } from "./use-drag-scroll";

/** jsdom has no layout, so scrollWidth/clientWidth are always 0 and writes to scrollLeft are ignored.
 *  Imitating an overflow means defining those three properties by hand. */
function stubMetrics(
  el: HTMLElement,
  { scrollWidth, clientWidth }: { scrollWidth: number; clientWidth: number },
) {
  Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
  Object.defineProperty(el, "scrollLeft", { value: 0, writable: true, configurable: true });
}

/** The hook registers through addEventListener directly (to avoid passive), so React's synthetic path
 *  fireEvent.wheel does not reach it. A native event is dispatched instead. */
function wheel(el: HTMLElement, init: WheelEventInit) {
  const ev = new WheelEvent("wheel", { cancelable: true, bubbles: true, ...init });
  el.dispatchEvent(ev);
  return ev;
}

function WheelProbe() {
  const { ref } = useWheelScrollX<HTMLDivElement>();
  return <div ref={ref} data-testid="scroller" />;
}

describe("useWheelScrollX", () => {
  it("넘칠 때 세로 휠을 가로 스크롤로 바꾸고 기본 동작을 막는다", () => {
    const { getByTestId } = render(<WheelProbe />);
    const el = getByTestId("scroller");
    stubMetrics(el, { scrollWidth: 500, clientWidth: 200 });

    const ev = wheel(el, { deltaY: 100 });

    expect(el.scrollLeft).toBe(100);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("역방향 휠은 반대로 스크롤한다", () => {
    const { getByTestId } = render(<WheelProbe />);
    const el = getByTestId("scroller");
    stubMetrics(el, { scrollWidth: 500, clientWidth: 200 });
    el.scrollLeft = 120;

    wheel(el, { deltaY: -50 });

    expect(el.scrollLeft).toBe(70);
  });

  it("넘치지 않으면 페이지 세로 스크롤에 양보한다", () => {
    const { getByTestId } = render(<WheelProbe />);
    const el = getByTestId("scroller");
    stubMetrics(el, { scrollWidth: 200, clientWidth: 200 });

    const ev = wheel(el, { deltaY: 100 });

    expect(el.scrollLeft).toBe(0);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("가로 제스처(|deltaX| >= |deltaY|)는 네이티브 동작에 맡긴다", () => {
    const { getByTestId } = render(<WheelProbe />);
    const el = getByTestId("scroller");
    stubMetrics(el, { scrollWidth: 500, clientWidth: 200 });

    const ev = wheel(el, { deltaX: 120, deltaY: 30 });

    expect(el.scrollLeft).toBe(0);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("언마운트되면 리스너를 뗀다", () => {
    const { getByTestId, unmount } = render(<WheelProbe />);
    const el = getByTestId("scroller");
    stubMetrics(el, { scrollWidth: 500, clientWidth: 200 });

    unmount();
    wheel(el, { deltaY: 100 });

    expect(el.scrollLeft).toBe(0);
  });
});

describe("useDragScrollX (회귀 — 기존 소비처가 깨지지 않을 것)", () => {
  let handlers: ReturnType<typeof useDragScrollX<HTMLDivElement>> | null = null;

  function DragProbe() {
    const scroll = useDragScrollX<HTMLDivElement>();
    handlers = scroll;
    const { ref, ...rest } = scroll;
    return <div ref={ref} {...rest} data-testid="scroller" />;
  }

  it("드래그 핸들러 4종을 계속 반환한다", () => {
    render(<DragProbe />);

    expect(typeof handlers?.onPointerDown).toBe("function");
    expect(typeof handlers?.onPointerMove).toBe("function");
    expect(typeof handlers?.onPointerUp).toBe("function");
    expect(typeof handlers?.onClickCapture).toBe("function");
  });

  it("휠 변환도 그대로 동작한다", () => {
    const { getByTestId } = render(<DragProbe />);
    const el = getByTestId("scroller");
    stubMetrics(el, { scrollWidth: 500, clientWidth: 200 });

    const ev = wheel(el, { deltaY: 80 });

    expect(el.scrollLeft).toBe(80);
    expect(ev.defaultPrevented).toBe(true);
  });
});
