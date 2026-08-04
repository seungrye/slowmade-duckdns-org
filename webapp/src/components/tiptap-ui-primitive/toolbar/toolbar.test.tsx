// 고정 툴바가 넘칠 때 휠로 좌우 스크롤 (#41 — 잘린 아이콘을 클릭할 수 있게).
// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Toolbar, ToolbarGroup } from "./toolbar";

function stubMetrics(
  el: HTMLElement,
  { scrollWidth, clientWidth }: { scrollWidth: number; clientWidth: number },
) {
  Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
  Object.defineProperty(el, "scrollLeft", { value: 0, writable: true, configurable: true });
}

function wheel(el: HTMLElement, init: WheelEventInit) {
  const ev = new WheelEvent("wheel", { cancelable: true, bubbles: true, ...init });
  el.dispatchEvent(ev);
  return ev;
}

function renderToolbar(variant?: "fixed" | "floating") {
  render(
    <Toolbar variant={variant}>
      <ToolbarGroup>
        <button type="button">B</button>
      </ToolbarGroup>
    </Toolbar>,
  );
  return screen.getByRole("toolbar");
}

describe("Toolbar 가로 휠 스크롤", () => {
  it("fixed 변형은 넘칠 때 세로 휠을 가로 스크롤로 바꾼다", () => {
    const el = renderToolbar("fixed");
    stubMetrics(el, { scrollWidth: 900, clientWidth: 400 });

    const ev = wheel(el, { deltaY: 120 });

    expect(el.scrollLeft).toBe(120);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("변형을 안 주면 기본값 fixed 라 동작한다", () => {
    const el = renderToolbar();
    stubMetrics(el, { scrollWidth: 900, clientWidth: 400 });

    wheel(el, { deltaY: 60 });

    expect(el.scrollLeft).toBe(60);
  });

  it("floating 변형은 overflow:hidden 이라 휠을 가로채지 않는다", () => {
    const el = renderToolbar("floating");
    stubMetrics(el, { scrollWidth: 900, clientWidth: 400 });

    const ev = wheel(el, { deltaY: 120 });

    expect(el.scrollLeft).toBe(0);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("넘치지 않으면 페이지 세로 스크롤에 양보한다", () => {
    const el = renderToolbar("fixed");
    stubMetrics(el, { scrollWidth: 400, clientWidth: 400 });

    const ev = wheel(el, { deltaY: 120 });

    expect(ev.defaultPrevented).toBe(false);
  });
});
