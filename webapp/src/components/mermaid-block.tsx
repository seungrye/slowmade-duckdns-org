'use client';

import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

// mermaid 는 클라이언트 측에서 1회만 초기화 — 중복 호출 방지.
// securityLevel: "loose" — 한국어 라벨/링크 등을 안전하게 표시하기 위해 sanitize 를 완화.
//   (post 본문은 작성자(인증 사용자) 가 직접 입력하므로 XSS 위험은 통제 범위.)
// useMaxWidth: false — mermaid 기본값(true)은 SVG 를 부모 컨테이너 100% width 로
//   확장해서 작은 다이어그램조차 과대 표시됨. 차트 타입별로 false 명시 → natural size
//   출력 + CSS 측에서 가운데 정렬·최대 width 제한.
let initialized = false;
function ensureInit(): void {
  if (initialized) return;
  initialized = true;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    fontFamily: 'Pretendard, sans-serif',
    flowchart: { useMaxWidth: false, htmlLabels: true },
    sequence: { useMaxWidth: false },
    state: { useMaxWidth: false },
    gantt: { useMaxWidth: false },
    class: { useMaxWidth: false },
    pie: { useMaxWidth: false },
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

export function MermaidBlock({ code }: MermaidBlockProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
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
        <div
          className="mermaid-rendered overflow-x-auto flex justify-center"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <pre className="bg-zinc-100 dark:bg-zinc-800 p-3 rounded text-sm">{code}</pre>
      )}
      <button
        type="button"
        onClick={() => setShowSource((s) => !s)}
        className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 hover:underline"
      >
        {showSource ? '다이어그램 보기' : '코드 보기'}
      </button>
      {showSource && (
        <pre className="bg-zinc-50 dark:bg-zinc-900 p-3 rounded text-sm mt-1 border border-zinc-200 dark:border-zinc-700 whitespace-pre-wrap">
          {code}
        </pre>
      )}
    </div>
  );
}
