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
    // #248 — mermaid 10 도 class diagram 의 박스 padding 이 과대 (사용자 보고).
    //   v9.4.3 으로 더 다운그레이드 — 옛 디자인이지만 class diagram 의 박스/
    //   콘텐츠 비율이 자연스럽고 padding 적당함 (jsdom probe 로 확인).
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
        // mermaid v9 는 render 가 동기 string 반환, v10/v11 은 Promise<{svg}>.
        // 양쪽 다 받도록 처리.
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
    // #246 — class diagram 은 mermaid 11 자체 측정 버그로 *각 클래스 박스의
    //   outer-path* 가 콘텐츠보다 5배 큰 좌표로 그려짐 (예: 라벨 9개*24px=216
    //   인데 outer-path BBox=2094x2118). 이 상태에서 #245 처럼 g.root 의 BBox
    //   로 viewBox 를 재설정하면 *부풀려진 outer-path 까지 포함* 한 BBox 라
    //   여전히 어색. 박스 자체를 콘텐츠 영역에 맞춰 재계산하는 우회:
    //   각 g.node 의 outer-path 를 그 노드의 label-group bounding 으로 줄인다.
    // #245 — flowchart/state 등은 mermaid 11 이 viewBox 를 svg 자체 getBBox()
    //   로 잡아 defs/markers 잔재로 ~10배 부풀음. g.root BBox 로 재설정.
    //   class diagram 은 시도했지만 (#246) mermaid 자체 측정 버그가 깊어 우회
    //   불가 — 원본 viewBox 유지 (콘텐츠는 잘리지 않고 다 보임, 다만 박스 안
    //   여백이 큼). #246 의 transform: scale + label-group 기반 viewBox 재계산은
    //   메서드/속성/박스가 잘려 더 안 좋아 원복.
    const role = svgEl.getAttribute('aria-roledescription');
    if (role !== 'class') {
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
        // #238 — block + max-w-4xl + mx-auto.
        // #239/#240 — JS ref override (defense in depth).
        // #243 — globals.css 의 `.mermaid-rendered svg { width/max-width/height
        //   !important }` 로 CSS spec 상 inline style 을 확실히 override.
        //   (#241/#242 의 Tailwind arbitrary variant 는 v4 에서 컴파일 안 됨 — 제거.)
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
