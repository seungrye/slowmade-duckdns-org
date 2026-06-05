'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

// mermaid 는 클라이언트 측에서 1회만 초기화 — 중복 호출 방지.
// securityLevel: "loose" — 한국어 라벨/링크 등을 안전하게 표시하기 위해 sanitize 를 완화.
// useMaxWidth: true (#238) — SVG width = 부모 컨테이너 100%.
let initialized = false;
function ensureInit(): void {
  if (initialized) return;
  initialized = true;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    fontFamily: 'Pretendard, sans-serif',
    flowchart: { useMaxWidth: true, htmlLabels: false },
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

// #252 — viz-js/graphviz fallback 제거. 사용자 결정: "머메이드로 교체".
//   class diagram 도 mermaid 로 렌더 (이전에 어색했던 결과 다시 발생).
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
        // mermaid v9 는 render 가 동기 string 반환, v10/v11 은 Promise<{svg}>.
        const result = (mermaid as unknown as {
          render: (id: string, code: string) => string | Promise<{ svg: string } | string>;
        }).render(idRef.current, code);
        let rendered: string;
        if (typeof result === 'string') {
          rendered = result;
        } else {
          const r = await result;
          rendered = typeof r === 'string' ? r : r.svg;
        }
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

  // #245 — mermaid 가 viewBox 를 svg 자체 getBBox() 로 잡아 defs/markers 잔재로
  //   ~10배 부풀음. g.root BBox 로 재설정. class diagram 은 g.root 가 없거나
  //   다른 구조라 skip (원본 mermaid 출력 유지).
  useLayoutEffect(() => {
    const svgEl = containerRef.current?.querySelector('svg');
    if (!svgEl) return;
    svgEl.setAttribute('width', '100%');
    svgEl.removeAttribute('height');
    svgEl.style.maxWidth = '100%';
    svgEl.style.height = 'auto';
    const role = svgEl.getAttribute('aria-roledescription');
    if (role !== 'class' && role !== 'classDiagram') {
      const rootG = svgEl.querySelector<SVGGraphicsElement>('g.root');
      if (rootG) {
        try {
          const bb = rootG.getBBox();
          if (bb.width > 0 && bb.height > 0) {
            const pad = 8;
            svgEl.setAttribute(
              'viewBox',
              `${bb.x - pad} ${bb.y - pad} ${bb.width + 2 * pad} ${bb.height + 2 * pad}`
            );
          }
        } catch {
          /* getBBox 가 detached/invisible SVG 에서 던질 수 있음 — 무시 */
        }
      }
    }
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
