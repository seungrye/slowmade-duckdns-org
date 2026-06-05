'use client';

import { useEffect, type RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import dynamic from 'next/dynamic';

// MermaidBlock 은 mermaid (수백 KB) 를 끌어오므로 dynamic import 로 분리 — post 본문에
// mermaid 코드블럭이 실제로 들어있는 경우에만 chunk 가 로드된다.
const MermaidBlock = dynamic(
  () => import('./mermaid-block').then((m) => ({ default: m.MermaidBlock })),
  { ssr: false }
);

export interface MermaidPostEnhancerProps {
  containerRef: RefObject<HTMLElement | null>;
  // 본문(htmlContent / TipTap JSON) 변경 시 후처리를 재실행하기 위한 의존성 키.
  contentKey?: unknown;
}

/**
 * post 본문 컨테이너 내부의 `<pre><code class="language-mermaid">...</code></pre>`
 * 코드블럭을 찾아 그 자리에 React `MermaidBlock` 을 마운트한다.
 *
 * TipTap viewer 가 codeBlock-lowlight 로 렌더한 결과를 그대로 두면 일반 코드블럭으로
 * 보이므로, 마운트 후 클라이언트 측에서 한 번만 교체한다. MutationObserver 가
 * 같은 컨테이너의 DOM 을 다시 흔들 수 있으므로, 교체된 노드에는
 * `data-mermaid-block` 마커를 두어 중복 처리 방지.
 */
export function MermaidPostEnhancer({ containerRef, contentKey }: MermaidPostEnhancerProps) {
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const roots: Root[] = [];

    const replaceAll = () => {
      const blocks = root.querySelectorAll<HTMLElement>('pre code.language-mermaid');
      blocks.forEach((codeEl) => {
        const pre = codeEl.parentElement;
        if (!pre || pre.dataset.mermaidReplaced === '1') return;
        // 원본 코드 추출 — TipTap/lowlight 가 syntax highlighting 으로 span 을 끼워넣더라도
        // textContent 면 평문 그대로 복원 가능.
        const code = codeEl.textContent ?? '';
        const container = document.createElement('div');
        container.dataset.mermaidReplaced = '1';
        pre.replaceWith(container);
        const r = createRoot(container);
        r.render(<MermaidBlock code={code} />);
        roots.push(r);
      });
    };

    replaceAll();

    // TipTap viewer 가 비동기로 본문을 렌더 — 첫 호출 시점에 코드블럭이 아직
    // 없을 수 있으므로 MutationObserver 로 추가 감지. (관찰자는 동일 컨테이너에
    // 여러 개 붙어도 무해 — 이미 교체된 블럭은 data-mermaid-replaced 로 skip.)
    const observer = new MutationObserver(() => {
      replaceAll();
    });
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      // unmount 는 다음 tick 으로 미뤄 React strict-mode/effect cleanup 충돌 회피.
      // (createRoot 와 동기 unmount 가 한 commit 내에 겹치면 경고 발생.)
      const toUnmount = roots.slice();
      queueMicrotask(() => {
        toUnmount.forEach((r) => {
          try {
            r.unmount();
          } catch {
            // 이미 detached 됐을 수 있음 — 무시.
          }
        });
      });
    };
  }, [containerRef, contentKey]);

  return null;
}
