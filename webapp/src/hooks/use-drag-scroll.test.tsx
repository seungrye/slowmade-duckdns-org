// 세로 휠 → 가로 스크롤 변환 (#41 — 에디터 툴바가 넘칠 때 잘린 아이콘에 손이 닿게).
// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { useWheelScrollX, useDragScrollX } from "./use-drag-scroll";

/** jsdom 은 레이아웃이 없어 scrollWidth/clientWidth 가 늘 0 이고 scrollLeft 는 쓰기가 무시된다.
 *  오버플로 상황을 흉내내려면 세 속성을 직접 정의해 줘야 한다. */
function stubMetrics(
  el: HTMLElement,
  { scrollWidth, clientWidth }: { scrollWidth: number; clientWidth: number },
) {
  Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
  Object.defineProperty(el, "scrollLeft", { value: 0, writable: true, configurable: true });
}

/** 훅이 addEventListener 로 직접 등록하므로(passive 회피) React 합성 경로인
 *  fireEvent.wheel 로는 잡히지 않는다. 네이티브 이벤트를 직접 쏜다. */
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
