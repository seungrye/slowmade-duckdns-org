// TypewriterText — 본문 문장을 글자 단위로 *진행하듯* 출력.
//
// #351 — 게임 본문에 타이프라이터 효과로 진행감 강화.
//
// 동작:
//   - text 가 변경되면 *처음부터* 글자 단위로 출력.
//   - skip-on-click: text 영역 클릭 시 즉시 전체 표시.
//   - prefers-reduced-motion: 즉시 전체 표시 (접근성).
//   - 환경 변수 NEXT_PUBLIC_TYPEWRITER=off 또는 vitest 환경: 자동 OFF.
//   - 출력 완료 시 onComplete 콜백.
//
// 한국어 글자 (BMP + 일부 보조 평면) 안전. surrogate pair 는 *분리 출력 가능*
// 한 글자 단위. 시나리오 본문은 BMP 기준이라 안전.

"use client";

import { useEffect, useRef, useState } from "react";
import { getTypewriterEnabled } from "@/lib/web-adventure/play/typewriter-options";

interface Props {
  text: string;
  /** 글자 사이 간격 (ms). 기본 30. */
  speed?: number;
  /** 출력 완료 시 발화. */
  onComplete?: () => void;
  /** 강제 skip (외부 트리거). */
  forceSkip?: boolean;
  /** 추가 className (각 p 의 그것). */
  className?: string;
}

function shouldDisableTypewriter(): boolean {
  // 1) SSR / vitest / jsdom — 동기 테스트 호환.
  if (typeof window === "undefined") return true;
  if (process.env.NODE_ENV === "test") return true;
  // 2) Playwright / Selenium 자동화 — navigator.webdriver=true.
  if (typeof navigator !== "undefined" && navigator.webdriver) return true;
  // 3) NEXT_PUBLIC_TYPEWRITER=off — 운영 토글.
  if (process.env.NEXT_PUBLIC_TYPEWRITER === "off") return true;
  // 3) prefers-reduced-motion — 접근성.
  if (typeof window.matchMedia === "function") {
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
    } catch {
      /* 무시 */
    }
  }
  // 4) 사용자 옵션 (typewriter-options.ts) — 단일 출처.
  if (!getTypewriterEnabled()) return true;
  return false;
}

export default function TypewriterText({
  text,
  speed = 30,
  onComplete,
  forceSkip = false,
  className = "leading-relaxed",
}: Props) {
  // 초기값 — 동기 환경 (vitest 등) 에서는 즉시 전체 출력.
  const disabled = shouldDisableTypewriter();
  const [shown, setShown] = useState<string>(disabled || forceSkip ? text : "");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    completedRef.current = false;
    if (disabled || forceSkip) {
      setShown(text);
      onComplete?.();
      completedRef.current = true;
      return;
    }
    setShown("");
    let i = 0;
    intervalRef.current = setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
      }
    }, speed);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // text 변경 시 처음부터 재시작.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speed, forceSkip]);

  // skip-on-click: 본문 클릭 → 즉시 전체.
  const skip = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setShown(text);
    if (!completedRef.current) {
      completedRef.current = true;
      onComplete?.();
    }
  };

  return (
    <p
      className={className}
      onClick={skip}
      // 출력 중 일때는 cursor 가 *기다리는* 느낌. 완료 후 일반.
      style={{ cursor: shown.length < text.length ? "pointer" : undefined }}
      data-typewriter-complete={shown.length >= text.length}
    >
      {shown}
    </p>
  );
}
