'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

// mermaid 는 클라이언트 측에서 1회만 초기화 — 중복 호출 방지.
// securityLevel: "loose" — 한국어 라벨/링크 등을 안전하게 표시하기 위해 sanitize 를 완화.
// useMaxWidth: true (#238) — SVG width = 부모 컨테이너 100%. 부모는 max-w-4xl
//   (896px) + mx-auto 로 너무 큰 경우만 제한. natural size (useMaxWidth: false)
//   는 작은 차트 ~200px 라 wide-screen 에서 점처럼 보이는 문제 (#229/#237 회귀).
let initialized = false;
function ensureInit(): void {
  if (initialized) return;
  initialized = true;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    fontFamily: 'Pretendard, sans-serif',
    flowchart: { useMaxWidth: true, htmlLabels: true },
    sequence: { useMaxWidth: true },
    state: { useMaxWidth: true },
    gantt: { useMaxWidth: true },
    class: { useMaxWidth: true },
    pie: { useMaxWidth: true },
  });
}

// 테스트 전용: 모듈 레벨 캐시(initialized) 를 리셋해 mermaid.initialize 호출 검증을 가능케 함.
export function __resetMermaidInitForTest(): void {
  initialized = false;
}

let nextId = 0;

export interface MermaidBlockProps {
  code: string;
}

// #238 — "코드 보기" 토글 버튼 + showSource state 완전 제거.
//   사용자 요청: "코드보기따위 필요 없어".
// #239 — mermaid 는 useMaxWidth: true 시 SVG inline style 로
//   `max-width: <natural>px` 를 박는다 (mermaid 코어 `tY` 함수).
//   부모 div 가 max-w-4xl(896px) 잡혀도 이 inline max-width 가 작으면 SVG
//   자체가 그 작은 px 로 제한되어 "영역은 크고 차트는 작음" 현상이 발생.
//   해결: dangerouslySetInnerHTML 후 useRef 로 svg element 를 찾아
//   inline maxWidth 를 "100%" 로 강제 덮어쓴다 (background-color 등 다른
//   inline style 은 보존).
export function MermaidBlock({ code }: MermaidBlockProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef<string>(`mermaid-${++nextId}`);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureInit();
    (async () => {
      try {
        const { svg: rendered } = await mermaid.render(idRef.current, code);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        if (!cancelled) {
          setError(message);
          setSvg(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  // #241 — paint 전 동기 적용 (useEffect → useLayoutEffect).
  //   useEffect 는 commit 후 비동기 → 작은 SVG 가 한 프레임 보였다 큼 (flash)
  //   또는 createRoot 별도 tree 의 타이밍 차이로 적용 자체가 늦음.
  //   useLayoutEffect 는 commit 직후 paint 전 동기 → 사용자가 *처음부터* 큰 SVG.
  // 다중 방어:
  //   1. setAttribute('width','100%') / removeAttribute('height')
  //   2. inline style override
  //   3. (className 의 [&_svg]:!w-full !max-w-full !h-auto 가 CSS !important 로
  //      추가 강제 — JS 가 어떤 이유로 못 박아도 CSS spec 상 inline style 이김)
  useLayoutEffect(() => {
    const svgEl = containerRef.current?.querySelector('svg');
    if (!svgEl) return;
    svgEl.setAttribute('width', '100%');
    svgEl.removeAttribute('height');
    svgEl.style.maxWidth = '100%';
    svgEl.style.height = 'auto';
  }, [svg]);

  if (error) {
    return (
      <pre
        data-mermaid-block="error"
        className="bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 p-3 rounded text-sm whitespace-pre-wrap"
      >
        {`Mermaid 오류: ${error}\n\n${code}`}
      </pre>
    );
  }

  return (
    <div className="my-4" data-mermaid-block="ok">
      {svg ? (
        // #238 — block + max-w-4xl + mx-auto.
        // #239/#240 — JS ref override (defense in depth).
        // #241 — child selector + !important — Tailwind arbitrary selector.
        //   `[&_svg]:!w-full` = `.mermaid-rendered svg { width: 100% !important; }`.
        //   CSS spec: !important 의 author rule 이 element 의 inline style 보다 우선.
        //   mermaid 가 박는 `style="max-width: 216px"` 도 이 CSS 가 override.
        //   결정적으로 *모든 차트 타입* 이 부모 폭(max-w-4xl=896px) 가득.
        <div
          ref={containerRef}
          className="mermaid-rendered overflow-x-auto block max-w-4xl mx-auto [&_svg]:!w-full [&_svg]:!max-w-full [&_svg]:!h-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <pre className="bg-zinc-100 dark:bg-zinc-800 p-3 rounded text-sm">{code}</pre>
      )}
    </div>
  );
}
