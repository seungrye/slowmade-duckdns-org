"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";

/** Turns **a vertical wheel into horizontal scrolling** in a horizontal scroll container (a scrollbar-hide tab bar, an overflowing toolbar and so on).
 *  It is needed because a container with its scrollbar hidden cannot be scrolled to the right edge with a mouse alone.
 *  Touch scrolling and a trackpad's horizontal gesture keep their native behaviour.
 *
 *  Use: const { ref } = useWheelScrollX<HTMLDivElement>();
 *       <div ref={ref} className="overflow-x-auto scrollbar-hide ...">
 *
 *  @param enabled a hook cannot be called conditionally, so this flag turns it off
 *                 (a variant that is overflow:hidden and has nothing to scroll, for instance).
 */
export function useWheelScrollX<T extends HTMLElement>(enabled = true) {
  // A callback ref plus state - the listener reattaches even when the node is replaced (unmounted and remounted by a conditional render).
  const elementRef = useRef<T | null>(null);
  const [node, setNode] = useState<T | null>(null);

  const ref = useCallback((el: T | null) => {
    elementRef.current = el;
    setNode(el);
  }, []);

  useEffect(() => {
    if (!enabled || !node) return;
    // React's onWheel is attached as passive and ignores preventDefault, so it is registered directly.
    const onWheel = (e: WheelEvent) => {
      if (node.scrollWidth <= node.clientWidth) return; // Without an overflow it yields to the page's scrolling
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return; // A horizontal gesture yields to the native behaviour
      node.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [enabled, node]);

  return { ref, elementRef };
}

/** The wheel conversion above plus **click-and-drag scrolling with the mouse**, and suppressing a stray tap click right after a drag.
 *  A drag swallows the click, so a container packed with buttons and popovers should use `useWheelScrollX` alone.
 *
 *  Use: const scroll = useDragScrollX<HTMLDivElement>();
 *       <div {...scroll} className="overflow-x-auto scrollbar-hide ...">
 */
export function useDragScrollX<T extends HTMLElement>() {
  const { ref, elementRef } = useWheelScrollX<T>();
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: false });

  const onPointerDown = (e: React.PointerEvent<T>) => {
    drag.current.moved = false;
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = elementRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    drag.current = { down: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<T>) => {
    const el = elementRef.current;
    const d = drag.current;
    if (!el || !d.down) return;
    const dx = e.clientX - d.startX;
    if (!d.moved) {
      if (Math.abs(dx) < 5) return; // A wobble during a click does not count as a drag
      d.moved = true;
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = d.startLeft - dx;
  };

  const onPointerUp = () => {
    drag.current.down = false;
  };

  const onClickCapture = (e: React.MouseEvent<T>) => {
    // A gesture that ended as a drag is blocked in the capture phase so it does not become a tap click.
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  };

  return { ref, onPointerDown, onPointerMove, onPointerUp, onClickCapture };
}
