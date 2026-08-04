"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";

/** 가로 스크롤 컨테이너(scrollbar-hide 탭바, 넘치는 툴바 등)에서 **세로 휠을 가로 스크롤로** 바꾼다.
 *  스크롤바를 숨긴 컨테이너는 마우스만으로는 오른쪽 끝에 닿을 수 없어서 필요하다.
 *  터치 스크롤·트랙패드 가로 제스처는 네이티브 동작을 그대로 둔다.
 *
 *  사용: const { ref } = useWheelScrollX<HTMLDivElement>();
 *        <div ref={ref} className="overflow-x-auto scrollbar-hide ...">
 *
 *  @param enabled 훅은 조건부로 호출할 수 없으므로, 끌 땐 이 플래그로 끈다
 *                 (예: overflow:hidden 이라 스크롤할 게 없는 변형).
 */
export function useWheelScrollX<T extends HTMLElement>(enabled = true) {
  // 콜백 ref + state — 노드가 교체돼도(조건부 렌더로 언마운트→재마운트) 리스너가 다시 붙는다.
  const elementRef = useRef<T | null>(null);
  const [node, setNode] = useState<T | null>(null);

  const ref = useCallback((el: T | null) => {
    elementRef.current = el;
    setNode(el);
  }, []);

  useEffect(() => {
    if (!enabled || !node) return;
    // React 의 onWheel 은 passive 로 붙어 preventDefault 가 무시되므로 직접 등록한다.
    const onWheel = (e: WheelEvent) => {
      if (node.scrollWidth <= node.clientWidth) return; // 넘치지 않으면 페이지 스크롤에 양보
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return; // 가로 제스처는 네이티브에 양보
      node.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [enabled, node]);

  return { ref, elementRef };
}

/** 위의 휠 변환에 **마우스 클릭&드래그 스크롤**과 드래그 직후 탭 클릭 오발동 억제를 더한 것.
 *  드래그가 클릭을 삼키므로, 버튼·팝오버가 들어찬 컨테이너에는 `useWheelScrollX` 만 쓸 것.
 *
 *  사용: const scroll = useDragScrollX<HTMLDivElement>();
 *        <div {...scroll} className="overflow-x-auto scrollbar-hide ...">
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
      if (Math.abs(dx) < 5) return; // 클릭 중 흔들림은 드래그로 치지 않음
      d.moved = true;
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = d.startLeft - dx;
  };

  const onPointerUp = () => {
    drag.current.down = false;
  };

  const onClickCapture = (e: React.MouseEvent<T>) => {
    // 드래그로 끝난 제스처가 탭 클릭으로 이어지지 않게 캡처 단계에서 차단.
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  };

  return { ref, onPointerDown, onPointerMove, onPointerUp, onClickCapture };
}
