"use client";

import { useEffect, useRef } from "react";
import type React from "react";

/** 가로 스크롤 컨테이너(scrollbar-hide 탭바 등)에 데스크톱 입력을 붙인다:
 *  세로 휠 → 가로 스크롤 변환, 마우스 클릭&드래그 스크롤, 드래그 직후 탭 클릭 오발동 억제.
 *  터치 스크롤·트랙패드 가로 제스처는 네이티브 동작을 그대로 둔다.
 *
 *  사용: const scroll = useDragScrollX<HTMLDivElement>();
 *        <div {...scroll} className="overflow-x-auto scrollbar-hide ...">
 */
export function useDragScrollX<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // React 의 onWheel 은 passive 로 붙어 preventDefault 가 무시되므로 직접 등록한다.
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return; // 넘치지 않으면 페이지 스크롤에 양보
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return; // 가로 제스처는 네이티브에 양보
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent<T>) => {
    drag.current.moved = false;
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    drag.current = { down: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<T>) => {
    const el = ref.current;
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
