"use client";

import { useEffect, useRef, useState } from "react";

// bevy-rogue WASM glue 의 default export 타입.
// (실제 .d.ts 는 site repo 에 없음 — wasm-bindgen --no-typescript.)
// 새 wasm-bindgen API: 단일 옵션 객체. 위치 인자는 deprecation 경고.
type WasmInit = (opts?: { module_or_path?: string | URL | Request | Response }) => Promise<unknown>;
// wasm 측 명시 진입점 — bevy-rogue/src/lib.rs `pub fn start(content_json: Option<String>)`.
// `null` 이면 wasm 측이 임베드 폴백으로 진행.
type WasmStart = (contentJson: string | null) => void;

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
// 캔버스의 native 해상도 — Bevy/winit 이 attribute 로 관리하는 값과 동일.
const CANVAS_NATIVE_WIDTH = 640;
const CANVAS_NATIVE_HEIGHT = 496;

export default function BevyRogueClient() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // 외부 래퍼 — 실제 보이는 박스 (반응형). 너비를 측정해 scale 계산.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // 로더 단계 — wasm 다운로드 → 콘텐츠 동기화 → 초기화 순서로 진행.
  // 사용자에게 무엇이 진행 중인지 한 줄로 보여준다.
  const [loadingStage, setLoadingStage] = useState<"wasm" | "content" | "init">("wasm");
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
          start: WasmStart;
        };
        if (cancelled) return;

        // wasm 바이너리 URL — 글루의 default 에 명시 전달해서
        // 글루 내부의 상대 경로 추측을 피한다(Next.js 라우트와 분리).
        // 새 wasm-bindgen 은 단일 옵션 객체 시그니처를 요구(위치 인자는 deprecation).
        await mod.default({ module_or_path: "/games/bevy-rogue/bevy_rogue_bg.wasm" });
        if (cancelled) return;

        // 콘텐츠 동기화 — site `/api/game/content/v1` 에서 최신 RON 묶음 받아오기.
        // 실패시 null 을 넘기면 wasm 측이 build.rs 임베드 폴백으로 진행한다.
        // 로컬 개발이나 API 미배포 상태에서도 게임은 정상 시작.
        setLoadingStage("content");
        let contentJson: string | null = null;
        try {
          const res = await fetch("/api/game/content/v1", { cache: "default" });
          if (res.ok) {
            contentJson = await res.text();
          } else {
            console.warn("[bevy-rogue] content fetch:", res.status);
          }
        } catch (e) {
          console.warn("[bevy-rogue] content fetch 실패 → 임베드 폴백:", e);
        }
        if (cancelled) return;

        // 명시적 진입점 호출 — wasm 측이 콘텐츠 install 후 게임 루프 시작.
        setLoadingStage("init");
        mod.start(contentJson);

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

  // 모바일 반응형 — 부모 래퍼의 실제 폭을 측정해서 캔버스에 transform: scale 적용.
  // canvas attribute/CSS 는 그대로 두고(winit 경합 회피) 부모 측정값만으로 시각 사이즈 조절.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const applyScale = () => {
      const w = wrapper.clientWidth;
      if (w <= 0) return;
      // 부모가 native 보다 작을 때만 축소, 크면 native 유지(1배).
      const scale = w < CANVAS_NATIVE_WIDTH ? w / CANVAS_NATIVE_WIDTH : 1;
      canvas.style.transform = scale === 1 ? "none" : `scale(${scale})`;
      canvas.style.transformOrigin = "top left";
    };

    applyScale();

    // ResizeObserver 로 폭 변화 추적 — orientation change, 창 리사이즈, 부모 레이아웃 변화 모두 커버.
    const ro = new ResizeObserver(() => applyScale());
    ro.observe(wrapper);

    return () => {
      ro.disconnect();
    };
  }, []);

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
