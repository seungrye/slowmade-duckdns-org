'use client';

import { useEffect, useRef, useState } from 'react';
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

  // #239 — SVG 마운트 직후 inline max-width 를 100% 로 override.
  // svg 가 새로 렌더될 때마다 (svg state 변화) 실행.
  // #240 — width/height attribute 도 강제: mermaid 의
  //   calculateSvgSizeAttrs(tY) 가 useMaxWidth:true 시 width="100%" + style="max-width:<Npx>"
  //   박지만, natural width(N) 가 부모(896)보다 작으면 SVG 가 N px 로 제한되어
  //   "영역만 크고 차트 작음" (예: 플로우차트 TD). useMaxWidth:false 분기로
  //   진입한 경우엔 width="<Npx>" 가 attribute 로 박혀 더 단단히 잡힘.
  //   해결: width attribute='100%' 강제 + height attribute 제거 + style 도 동일.
  //   결과: 시퀀스(원래도 큰) + 플로우차트(작던) 모두 부모 폭 가득.
  useEffect(() => {
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
        //   useMaxWidth: true 와 짝지어 SVG 가 컨테이너 폭(최대 896px) 가득.
        //   inline-block + max-w-full (#237) 은 natural width 사용 → useMaxWidth: false 와 같은 결과 → 작음.
        // #239 — ref 로 svg element 를 잡아 inline max-width 를 100% 로 덮어쓴다.
        <div
          ref={containerRef}
          className="mermaid-rendered overflow-x-auto block max-w-4xl mx-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <pre className="bg-zinc-100 dark:bg-zinc-800 p-3 rounded text-sm">{code}</pre>
      )}
    </div>
  );
}
