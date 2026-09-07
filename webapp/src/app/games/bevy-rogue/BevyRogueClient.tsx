"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import VirtualKeypad from "./VirtualKeypad";

// The type of the bevy-rogue WASM glue's default export.
// (The real .d.ts is not in the site repo - wasm-bindgen --no-typescript.)
// The new wasm-bindgen API: a single options object. Positional arguments give a deprecation warning.
type WasmInit = (opts?: { module_or_path?: string | URL | Request | Response }) => Promise<unknown>;
// The wasm side's explicit entry point - bevy-rogue/src/lib.rs's `pub fn start(content_json: Option<String>)`.
// With `null` the wasm side proceeds on its embedded fallback.
type WasmStart = (contentJson: string | null) => void;

/**
 * The bevy-rogue WASM game client.
 *
 * The structure:
 *   - it mounts a <canvas id="bevy-canvas"/>, which Bevy picks up as its winit canvas.
 *   - a useEffect dynamically imports /games/bevy-rogue/bevy_rogue.js and initialises the
 *     wasm by calling default(initWasmUrl).
 *   - a Korean loader shows during initialisation, and a Korean error message on failure.
 *
 * Avoiding SSR:
 *   - this file is a "use client" client component.
 *   - page.tsx imports it through next/dynamic({ ssr: false }).
 */
// The canvas's native resolution - the same value Bevy and winit manage as an attribute.
const CANVAS_NATIVE_WIDTH = 640;
const CANVAS_NATIVE_HEIGHT = 496;

export default function BevyRogueClient() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // The outer wrapper - the visible box (responsive). Its width is measured to compute the scale.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // The loader's stages - downloading the wasm, syncing the content, then initialising.
  // It shows the user in one line what is in progress.
  const [loadingStage, setLoadingStage] = useState<"wasm" | "content" | "init">("wasm");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    // Unmounting before the import finishes is harmless even if Bevy cannot find the canvas.

    (async () => {
      try {
        // The wasm glue has to be in public/games/bevy-rogue/ (publish-to-site.sh).
        // Both /* @vite-ignore */ and /* webpackIgnore: true */ are given so
        // Next.js (turbopack/webpack) keeps it out of the bundle and only fetches at run time.
        const glueUrl = "/games/bevy-rogue/bevy_rogue.js";
        const mod = (await import(/* webpackIgnore: true */ /* @vite-ignore */ glueUrl)) as {
          default: WasmInit;
          start: WasmStart;
        };
        if (cancelled) return;

        // The wasm binary's URL - passed explicitly to the glue's default so
        // the glue does not guess a relative path internally (keeping it separate from Next.js routing).
        // The new wasm-bindgen requires the single-options-object signature (positional arguments are deprecated).
        await mod.default({ module_or_path: "/games/bevy-rogue/bevy_rogue_bg.wasm" });
        if (cancelled) return;

        // The REMOTE content fetch policy:
        //   - a game in progress ('progress.ron' in localStorage) -> SKIP.
        //     A game in progress keeps its saved town_config and catalogue state as they are.
        //     A changed site option does not reach that game. A new game fetches and applies it.
        //   - a new game -> fetch /api/game/content/v1 -> install through mod.start.
        //   - ?live=0 -> force embedded mode (for debugging).
        setLoadingStage("content");
        let contentJson: string | null = null;
        const url = new URL(window.location.href);
        const liveDisabled = url.searchParams.get("live") === "0";
        const hasProgress = (() => {
          try { return !!window.localStorage?.getItem("progress.ron"); }
          catch { return false; }
        })();
        if (!liveDisabled && !hasProgress) {
          try {
            const res = await fetch("/api/game/content/v1", { cache: "no-store" });
            if (res.ok) contentJson = await res.text();
            else console.warn("[bevy-rogue] content fetch:", res.status);
          } catch (e) {
            console.warn("[bevy-rogue] content fetch 실패 → 임베드 폴백:", e);
          }
        } else if (hasProgress) {
          console.info("[bevy-rogue] 진행 중 게임 감지 — REMOTE fetch SKIP, 저장된 상태로 시작");
        }
        if (cancelled) return;

        // Calling the explicit entry point - the wasm side installs the content then starts the game loop.
        setLoadingStage("init");
        mod.start(contentJson);

        setStatus("ready");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // The "Using exceptions for control flow" winit throws when starting the EventLoop in wasm is
        // a sign of normal operation - it means Bevy has entered its run loop.
        // It is not a real error, so it is treated as ready.
        if (/Using exceptions for control flow/.test(msg)) {
          if (cancelled) return;
          setStatus("ready");
          return;
        }
        // A Korean overlay for the user, the original error in the console for the developer.
        console.error("[bevy-rogue] wasm 초기화 실패:", e);
        if (cancelled) return;
        setErrorMessage(msg);
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Mobile responsiveness - the parent wrapper's real width is measured and a transform: scale applied to the canvas.
  // The canvas attributes and CSS are left alone (avoiding a fight with winit) and only the parent's measurement drives the visual size.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const applyScale = () => {
      const w = wrapper.clientWidth;
      if (w <= 0) return;
      // It shrinks only when the parent is smaller than native; larger keeps native (1x).
      const scale = w < CANVAS_NATIVE_WIDTH ? w / CANVAS_NATIVE_WIDTH : 1;
      canvas.style.transform = scale === 1 ? "none" : `scale(${scale})`;
      canvas.style.transformOrigin = "top left";
    };

    applyScale();

    // A ResizeObserver tracks width changes - covering orientation changes, window resizes and parent layout changes alike.
    const ro = new ResizeObserver(() => applyScale());
    ro.observe(wrapper);

    return () => {
      ro.disconnect();
    };
  }, []);

  // The canvas ref is exposed stably to the virtual keypad - useCallback avoids creating a new function every render.
  const getCanvas = useCallback(() => canvasRef.current, []);

  return (
    <div className="relative w-full flex flex-col items-center">
      {/*
        모바일 반응형 캔버스 컨테이너 (외부 래퍼).
        - 부모는 max-w-[640px] + w-full → 데스크탑에선 640px native, 작은 화면에선 100%.
        - aspectRatio + overflow:hidden 으로 scale 된 캔버스가 박스 안에 정확히 들어오게.
        - canvas 자체 attribute(width=640,height=496)·CSS 는 그대로 — winit 정책과 경합 회피.
        - useEffect + ResizeObserver 가 wrapper.clientWidth 를 측정해
          canvas.style.transform = scale(parentWidth/640) 을 동적으로 적용.
        - 픽셀 아트 보존: image-rendering: pixelated.
      */}
      <div
        ref={wrapperRef}
        className="relative w-full max-w-[640px] mx-auto bg-black rounded-lg overflow-hidden shadow-2xl"
        style={{ aspectRatio: `${CANVAS_NATIVE_WIDTH}/${CANVAS_NATIVE_HEIGHT}` }}
      >
        <canvas
          id="bevy-canvas"
          ref={canvasRef}
          width={CANVAS_NATIVE_WIDTH}
          height={CANVAS_NATIVE_HEIGHT}
          tabIndex={0}
          className="block bg-black outline-none"
          style={{ imageRendering: "pixelated" }}
          aria-label="bevy-rogue 게임 캔버스"
        />

        {/* 로딩 오버레이 — 외부 래퍼(스케일된 보이는 영역) 기준 */}
        {status === "loading" && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/80 text-gray-200"
            role="status"
            aria-live="polite"
          >
            <div className="text-center">
              <div className="text-lg font-semibold mb-2">
                {loadingStage === "wasm" && "게임을 불러오는 중..."}
                {loadingStage === "content" && "콘텐츠 동기화 중..."}
                {loadingStage === "init" && "게임 초기화 중..."}
              </div>
              <div className="text-sm text-gray-400">
                {loadingStage === "wasm" && "wasm 번들을 다운로드하는 중입니다(수 초 소요)."}
                {loadingStage === "content" && "최신 게임 콘텐츠를 받아오는 중입니다."}
                {loadingStage === "init" && "게임 루프를 시작하는 중입니다."}
              </div>
            </div>
          </div>
        )}

        {/* 에러 오버레이 */}
        {status === "error" && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/90 text-red-300 p-6"
            role="alert"
          >
            <div className="text-center max-w-md">
              <div className="text-lg font-semibold mb-2">게임을 불러오지 못했습니다.</div>
              <div className="text-sm text-gray-400 mb-3">
                네트워크 또는 브라우저 호환성 문제일 수 있습니다. 새로고침해 보세요.
              </div>
              <details className="text-xs text-gray-500 text-left">
                <summary className="cursor-pointer">상세 오류</summary>
                <pre className="mt-2 whitespace-pre-wrap break-words">{errorMessage}</pre>
              </details>
            </div>
          </div>
        )}
      </div>

      {/*
        모바일 가상 키패드 — 데스크탑(md 이상) 에서는 숨겨진다 (VirtualKeypad 내부 `md:hidden`).
        getCanvas 콜백으로 canvasRef 를 노출 — 키패드 내부에서 KeyboardEvent dispatch 대상을 결정.
      */}
      <div className="w-full max-w-[640px] mx-auto">
        <VirtualKeypad getCanvas={getCanvas} />
      </div>

      {/* 조작 안내 */}
      <div className="mt-4 text-sm text-gray-400 text-center max-w-2xl">
        <div className="mb-1">
          이동: <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-200">WASD</kbd> /{" "}
          <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-200">방향키</kbd>
        </div>
        <div className="text-xs text-gray-500 hidden md:block">
          캔버스를 한 번 클릭한 뒤 키 입력이 잘 안 되면 다시 캔버스를 포커스하세요.
        </div>
        <div className="text-xs text-gray-500 md:hidden">
          모바일에서는 아래 가상 키패드로 조작할 수 있습니다.
        </div>
      </div>
    </div>
  );
}
