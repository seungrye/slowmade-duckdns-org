"use client";

import { useEffect, useRef, useState } from "react";

// bevy-rogue WASM glue 의 default export 타입.
// (실제 .d.ts 는 site repo 에 없음 — wasm-bindgen --no-typescript.)
type WasmInit = (input?: string | URL | Request | Response) => Promise<unknown>;

/**
 * bevy-rogue WASM 게임 클라이언트.
 *
 * 구조:
 *   - <canvas id="bevy-canvas"/> 를 마운트 → Bevy 가 이걸 잡아서 winit 캔버스로 사용.
 *   - useEffect 에서 /games/bevy-rogue/bevy_rogue.js 를 dynamic import →
 *     default(initWasmUrl) 호출로 wasm 초기화.
 *   - 초기화 중엔 한국어 로더, 실패 시 한국어 에러 메시지.
 *
 * SSR 회피:
 *   - 이 파일은 "use client" 클라이언트 컴포넌트.
 *   - page.tsx 가 next/dynamic({ ssr: false }) 로 import 한다.
 */
export default function BevyRogueClient() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    // import 가 끝나기 전에 unmount 되면 Bevy 가 캔버스를 찾지 못해도 무해.

    (async () => {
      try {
        // wasm 글루는 public/games/bevy-rogue/ 에 있어야 한다(publish-to-site.sh).
        // /* @vite-ignore */ /* webpackIgnore: true */ 둘 다 줘서
        // Next.js (turbopack/webpack) 가 번들에 포함시키지 않고 런타임 fetch 만 수행.
        const glueUrl = "/games/bevy-rogue/bevy_rogue.js";
        const mod = (await import(/* webpackIgnore: true */ /* @vite-ignore */ glueUrl)) as {
          default: WasmInit;
        };
        if (cancelled) return;

        // wasm 바이너리 URL — 글루의 default(input) 에 명시 전달해서
        // 글루 내부의 상대 경로 추측을 피한다(Next.js 라우트와 분리).
        await mod.default("/games/bevy-rogue/bevy_rogue_bg.wasm");
        if (cancelled) return;

        setStatus("ready");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // winit 이 wasm 에서 EventLoop 를 시작할 때 던지는 "Using exceptions for
        // control flow" 는 정상 동작 신호 — Bevy 가 실행 루프에 들어갔다는 뜻.
        // 실제 에러가 아니므로 ready 처리.
        if (/Using exceptions for control flow/.test(msg)) {
          if (cancelled) return;
          setStatus("ready");
          return;
        }
        // 사용자엔 한국어 오버레이, 개발자엔 원본 에러를 콘솔에.
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

  return (
    <div className="relative w-full flex flex-col items-center">
      {/*
        캔버스 컨테이너 — Bevy 가 결정한 resolution(현재 ~640×496) 을 그대로 두고
        부모 flex 로 가운데 정렬한다.
        과거: 부모 w-full max-w-5xl + canvas w-full → winit 이 늘어난 캔버스를
              window 크기로 인식하지만 카메라/world 는 lib.rs 의 고정 resolution
              기준이라 게임이 캔버스 왼쪽에만 그려졌다.
      */}
      <div className="relative inline-block bg-black rounded-lg overflow-hidden shadow-2xl">
        <canvas
          id="bevy-canvas"
          ref={canvasRef}
          // attribute(=drawing buffer)는 Bevy resolution(640x496) 그대로 둔다.
          // winit 의 wasm 백엔드는 ResizeObserver 를 쓰지 않아 attribute 기준 그림.
          width={640}
          height={496}
          tabIndex={0}
          // CSS 만 키워 display 사이즈를 확대(픽셀 1:1 정수배). 게임 자체는
          // 변하지 않지만 시각적으로 페이지를 더 차지해 카메라 viewport 가
          // 한쪽에 작게 보이는 느낌을 줄인다. 픽셀 아트라 pixelated 유지.
          className="block bg-black outline-none"
          style={{
            imageRendering: "pixelated",
            width: "min(1024px, 95vw)",
            height: "auto",
            aspectRatio: "640 / 496",
          }}
          aria-label="bevy-rogue 게임 캔버스"
        />

        {/* 로딩 오버레이 */}
        {status === "loading" && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/80 text-gray-200"
            role="status"
            aria-live="polite"
          >
            <div className="text-center">
              <div className="text-lg font-semibold mb-2">게임을 불러오는 중...</div>
              <div className="text-sm text-gray-400">
                wasm 번들을 다운로드하고 초기화하는 중입니다(수 초 소요).
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

      {/* 조작 안내 */}
      <div className="mt-4 text-sm text-gray-400 text-center max-w-2xl">
        <div className="mb-1">
          이동: <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-200">WASD</kbd> /{" "}
          <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-200">방향키</kbd>
        </div>
        <div className="text-xs text-gray-500">
          캔버스를 한 번 클릭한 뒤 키 입력이 잘 안 되면 다시 캔버스를 포커스하세요.
        </div>
      </div>
    </div>
  );
}
