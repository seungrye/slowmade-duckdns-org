// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

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

  it('"코드 보기" 토글 버튼을 누르면 원본 mermaid 코드가 표시된다', async () => {
    (mermaid as unknown as { render: ReturnType<typeof vi.fn> }).render.mockResolvedValue({
      svg: '<svg>OK</svg>',
    });

    render(<MermaidBlock code="graph LR\nX-->Y" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /코드 보기/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /코드 보기/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /다이어그램 보기/ })).toBeInTheDocument();
    });
    // 토글 후 원본 코드 노출
    const matches = screen.getAllByText(/graph LR/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('mermaid.initialize 가 모든 차트 타입에 useMaxWidth: false 옵션을 포함한다', async () => {
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
        flowchart: expect.objectContaining({ useMaxWidth: false }),
        sequence: expect.objectContaining({ useMaxWidth: false }),
        state: expect.objectContaining({ useMaxWidth: false }),
        gantt: expect.objectContaining({ useMaxWidth: false }),
        class: expect.objectContaining({ useMaxWidth: false }),
        pie: expect.objectContaining({ useMaxWidth: false }),
      })
    );
  });

  it('렌더된 SVG 컨테이너에 flex justify-center 클래스가 적용되어 중앙 정렬된다', async () => {
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
    expect(className).toMatch(/\bflex\b/);
    expect(className).toMatch(/\bjustify-center\b/);
  });
});
