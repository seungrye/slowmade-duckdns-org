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
export function MermaidBlock({ code }: MermaidBlockProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef<string>(`mermaid-${++nextId}`);

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
        <div
          className="mermaid-rendered overflow-x-auto block max-w-4xl mx-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <pre className="bg-zinc-100 dark:bg-zinc-800 p-3 rounded text-sm">{code}</pre>
      )}
    </div>
  );
}
