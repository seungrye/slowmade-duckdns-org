// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { useRef } from 'react';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg data-testid="mm">M</svg>' }),
  },
}));

import { MermaidPostEnhancer } from './mermaid-post-enhancer';

function Host({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div>
      <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
      <MermaidPostEnhancer containerRef={ref} contentKey={html} />
    </div>
  );
}

describe('MermaidPostEnhancer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('language-mermaid 코드블럭을 발견하면 MermaidBlock 으로 교체한다', async () => {
    const html = `<pre><code class="language-mermaid">graph TD\nA--&gt;B</code></pre>`;
    const { container } = render(<Host html={html} />);

    await waitFor(() => {
      const replaced = container.querySelector('[data-mermaid-block]');
      expect(replaced).not.toBeNull();
    });
  });

  it('mermaid 가 아닌 코드블럭은 그대로 둔다', async () => {
    const html = `<pre><code class="language-js">const x = 1;</code></pre>`;
    const { container } = render(<Host html={html} />);

    // 약간 대기해도 교체 안 됨
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('code.language-js')).not.toBeNull();
    expect(container.querySelector('[data-mermaid-block]')).toBeNull();
  });
});
