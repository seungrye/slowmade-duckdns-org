// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

import mermaid from 'mermaid';
import { MermaidBlock, __resetMermaidInitForTest } from './mermaid-block';

describe('MermaidBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetMermaidInitForTest();
  });

  it('mermaid 코드를 SVG 로 렌더해서 화면에 출력한다', async () => {
    (mermaid as unknown as { render: ReturnType<typeof vi.fn> }).render.mockResolvedValue({
      svg: '<svg data-testid="rendered-svg">FLOW</svg>',
    });

    render(<MermaidBlock code="graph TD\nA-->B" />);

    await waitFor(() => {
      expect(screen.getByTestId('rendered-svg')).toBeInTheDocument();
    });
    expect((mermaid as unknown as { render: ReturnType<typeof vi.fn> }).render).toHaveBeenCalled();
  });

  it('렌더 실패 시 오류 메시지와 원본 코드가 노출된다', async () => {
    (mermaid as unknown as { render: ReturnType<typeof vi.fn> }).render.mockRejectedValue(
      new Error('Parse error on line 1')
    );

    render(<MermaidBlock code="invalid mermaid code" />);

    await waitFor(() => {
      expect(screen.getByText(/Mermaid 오류/)).toBeInTheDocument();
      expect(screen.getByText(/Parse error on line 1/)).toBeInTheDocument();
      expect(screen.getByText(/invalid mermaid code/)).toBeInTheDocument();
    });
  });

  // #238 — 사용자 명시: "코드보기따위 필요 없어". 토글 button 자체를 없앤다.
  it('"코드 보기" / "다이어그램 보기" 토글 버튼이 존재하지 않는다 (#238)', async () => {
    (mermaid as unknown as { render: ReturnType<typeof vi.fn> }).render.mockResolvedValue({
      svg: '<svg>OK</svg>',
    });

    render(<MermaidBlock code="graph LR\nX-->Y" />);

    await waitFor(() => {
      // SVG 렌더 후
      const buttons = screen.queryAllByRole('button');
      expect(buttons.find((b) => /코드 보기|다이어그램 보기/.test(b.textContent ?? ''))).toBeUndefined();
    });
  });

  // #238 — useMaxWidth: true 로 SVG = 부모 컨테이너 100%.
  //   #229/#237 의 false 는 natural size (작은 차트 ~200px) 라 wide-screen 에서 점처럼 보임.
  //   컨테이너 측에서 max-w-4xl (896px) 로 너무 큰 경우만 제한.
  it('mermaid.initialize 가 모든 차트 타입에 useMaxWidth: true 옵션을 포함한다 (#238)', async () => {
    (mermaid as unknown as { render: ReturnType<typeof vi.fn> }).render.mockResolvedValue({
      svg: '<svg>OK</svg>',
    });

    render(<MermaidBlock code="graph TD\nA-->B" />);

    await waitFor(() => {
      expect(
        (mermaid as unknown as { initialize: ReturnType<typeof vi.fn> }).initialize
      ).toHaveBeenCalled();
    });

    const initSpy = (mermaid as unknown as { initialize: ReturnType<typeof vi.fn> }).initialize;
    const initArgs = initSpy.mock.calls[0]?.[0];
    expect(initArgs).toEqual(
      expect.objectContaining({
        flowchart: expect.objectContaining({ useMaxWidth: true }),
        sequence: expect.objectContaining({ useMaxWidth: true }),
        state: expect.objectContaining({ useMaxWidth: true }),
        gantt: expect.objectContaining({ useMaxWidth: true }),
        class: expect.objectContaining({ useMaxWidth: true }),
        pie: expect.objectContaining({ useMaxWidth: true }),
      })
    );
  });

  // #238 — 컨테이너는 max-w-4xl + mx-auto + block (inline-block 아님).
  //   inline-block + max-w-full 은 natural width 그대로 사용 → useMaxWidth: false 와 같은 결과.
  //   block + max-w-4xl 이라야 SVG width 100% 가 의도대로 동작.
  it('렌더된 SVG 컨테이너에 max-w-4xl + mx-auto 가 적용된다 (#238)', async () => {
    (mermaid as unknown as { render: ReturnType<typeof vi.fn> }).render.mockResolvedValue({
      svg: '<svg data-testid="centered-svg">FLOW</svg>',
    });

    const { container } = render(<MermaidBlock code="graph TD\nA-->B" />);

    await waitFor(() => {
      expect(screen.getByTestId('centered-svg')).toBeInTheDocument();
    });

    const rendered = container.querySelector('.mermaid-rendered');
    expect(rendered).not.toBeNull();
    const className = rendered?.getAttribute('class') ?? '';
    expect(className).toMatch(/\bmax-w-4xl\b/);
    expect(className).toMatch(/\bmx-auto\b/);
  });

  // #239 — mermaid 가 useMaxWidth:true 시 SVG inline style 로 `max-width: <natural>px`
  //   를 박아 부모 div 가 max-w-4xl 잡혀도 SVG 자체가 작게 표시되는 문제.
  //   사용자 보고: "영역은 엄청 크게, 차트는 너무 작게".
  //   해결: dangerouslySetInnerHTML 후 svg element 의 inline max-width 를 강제 제거.
  it('렌더 후 SVG element 의 inline max-width 를 100% 로 override 한다 (#239)', async () => {
    // mermaid 가 실제 부여하는 형식: width="100%" + style="max-width: 200px;"
    (mermaid as unknown as { render: ReturnType<typeof vi.fn> }).render.mockResolvedValue({
      svg: '<svg data-testid="small-svg" width="100%" style="max-width: 200px; background-color: white;">FLOW</svg>',
    });

    const { container } = render(<MermaidBlock code="graph TD\nA-->B" />);

    await waitFor(() => {
      expect(screen.getByTestId('small-svg')).toBeInTheDocument();
    });

    const svg = container.querySelector('svg') as SVGElement | null;
    expect(svg).not.toBeNull();
    // mermaid 가 박은 max-width: 200px 가 100% 로 override 되어야 함.
    expect(svg?.style.maxWidth).toBe('100%');
    // width="100%" 는 유지.
    expect(svg?.getAttribute('width')).toBe('100%');
    // background-color 같은 다른 style 은 보존.
    expect(svg?.style.backgroundColor).toBe('white');
  });
});
