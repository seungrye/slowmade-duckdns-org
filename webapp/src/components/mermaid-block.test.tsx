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

  // #241 — jsdom + mermaid 11 실제 render 결과 (probe 로 확인):
  //   flowchart: width="100%" + style="max-width: 216px"  ← 부모(896)의 24%, 사용자 "작음"
  //   sequence:  width="100%" + style="max-width: 590px"  ← 부모의 65%, 사용자 "정상"
  //   둘 다 동일 mermaid 코어 함수 calculateSvgSizeAttrs(tY) 통과 — 차이는
  //   natural BBox 만. JS 의 svgEl.style.maxWidth='100%' override 만으론 불안:
  //   별도 createRoot 의 effect 타이밍, dynamic chunk 로딩 race 등.
  //   결정적 fix: 컨테이너 className 에 child selector + !important — CSS spec
  //   상 !important 가 inline style 보다 항상 우선. mermaid 가 어떤 inline
  //   style 을 박아도 항상 부모 폭 가득.
  // #243 — globals.css 의 `.mermaid-rendered svg { ... !important }` 로 CSS
  //   spec 상 inline style override. Tailwind arbitrary variant (#241/#242) 는
  //   v4 에서 컴파일 안 됨 — globals.css 직접 CSS 가 결정적.
  it('컨테이너 className 에 mermaid-rendered 클래스가 유지된다 (#243)', async () => {
    (mermaid as unknown as { render: ReturnType<typeof vi.fn> }).render.mockResolvedValue({
      svg: '<svg data-testid="forced-svg">FLOW</svg>',
    });

    const { container } = render(<MermaidBlock code="graph TD\nA-->B" />);

    await waitFor(() => {
      expect(screen.getByTestId('forced-svg')).toBeInTheDocument();
    });

    const rendered = container.querySelector('.mermaid-rendered');
    expect(rendered).not.toBeNull();
  });

  // #244 — mermaid 11 의 flowchart-v2 가 라벨을 markdown 처리해 <p> 로 wrap.
  //   p 가 block element 라 measure 시 부모 max-width(200) 까지 확장 → 노드 폭
  //   과대 측정 → viewBox 부풀음. initialize 에 markdownAutoWrap: false 박아
  //   라벨 측정 정상화. (단독으론 viewBox 문제 해결 못 함 — #245 와 함께.)
  it('mermaid.initialize 가 markdownAutoWrap: false 를 포함한다 (#244)', async () => {
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
    expect(initArgs).toEqual(expect.objectContaining({ markdownAutoWrap: false }));
  });

  // #245 — mermaid 의 setupGraphViewbox 는 svg.getBBox() 로 viewBox 잡지만
  //   svg 안 defs/markers/측정 잔재가 BBox 를 부풀려 viewBox 가 그래프 실제
  //   크기의 ~10배. 플로우차트 g.root BBox=208x417 인데 viewBox=2056x2056 →
  //   컨테이너만 크고 차트 압축. 사용자: "영역은 엄청 크게, 차트는 너무 작게".
  //   해결: useLayoutEffect 에서 g.root.getBBox() 로 viewBox 재설정.
  //   (jsdom 은 SVGGraphicsElement.getBBox 미지원 → polyfill 필요.)
  it('렌더 후 g.root 의 BBox 로 svg viewBox 재설정 (#245)', async () => {
    // SVGElement.prototype.getBBox polyfill — bb = (5, 10, 200, 400)
    const proto = (globalThis as unknown as { SVGElement: { prototype: SVGElement } })
      .SVGElement.prototype as SVGElement & {
        getBBox?: () => { x: number; y: number; width: number; height: number };
      };
    proto.getBBox = () => ({ x: 5, y: 10, width: 200, height: 400 });

    (mermaid as unknown as { render: ReturnType<typeof vi.fn> }).render.mockResolvedValue({
      svg:
        '<svg data-testid="vb-svg" width="100%" style="max-width: 2000px" viewBox="-48 -48 2056 2056">' +
        '<g class="root"><g class="nodes"></g></g>' +
        '</svg>',
    });

    const { container } = render(<MermaidBlock code="graph TD\nA-->B" />);

    await waitFor(() => {
      expect(screen.getByTestId('vb-svg')).toBeInTheDocument();
    });

    const svgEl = container.querySelector('svg');
    expect(svgEl).not.toBeNull();
    // bb=(5,10,200,400) + pad=8 → viewBox="-3 2 216 416"
    expect(svgEl?.getAttribute('viewBox')).toBe('-3 2 216 416');
  });

  // #245 추가: g.root 가 없으면 (sequence/gantt/pie 등) viewBox 건드리지 않는다.
  it('g.root 가 없으면 viewBox 를 변경하지 않는다 (#245)', async () => {
    (mermaid as unknown as { render: ReturnType<typeof vi.fn> }).render.mockResolvedValue({
      svg: '<svg data-testid="seq-svg" viewBox="-50 -10 697 363"></svg>',
    });

    const { container } = render(<MermaidBlock code="sequenceDiagram\nA->>B: hi" />);

    await waitFor(() => {
      expect(screen.getByTestId('seq-svg')).toBeInTheDocument();
    });

    const svgEl = container.querySelector('svg');
    expect(svgEl?.getAttribute('viewBox')).toBe('-50 -10 697 363');
  });

  // #240 — 사용자 보고: "플로우차트만 작음, 시퀀스는 정상".
  //   원인 진단: mermaid 코어 calculateSvgSizeAttrs(tY) 는 useMaxWidth:true 시
  //   `width="100%"` + `style="max-width: <natural>px"` 박음 — 모든 차트 공통.
  //   차이는 natural width: 시퀀스(가로 배치) ≫ 896px → max-width 가 부모보다
  //   커서 제한 안 함 → 정상. 플로우차트(TD, 세로 배치) ~200px → max-width:200px
  //   → SVG 가 200px 로 제한 → 작음. 추가로 mermaid 가 useMaxWidth:false 분기로
  //   진입할 경우 width=<px>, height=<px> attribute 가 박혀 CSS width 100% 를
  //   덮을 수 있음.
  //   해결: width attribute 도 '100%' 강제 + height attribute 제거.
  it('mermaid 가 width/height 를 px attribute 로 박은 경우에도 부모 폭 가득 (#240)', async () => {
    // useMaxWidth:false 분기 시뮬레이션 — width/height 가 px attribute.
    (mermaid as unknown as { render: ReturnType<typeof vi.fn> }).render.mockResolvedValue({
      svg: '<svg data-testid="px-svg" width="200" height="300">FLOW</svg>',
    });

    const { container } = render(<MermaidBlock code="graph TD\nA-->B" />);

    await waitFor(() => {
      expect(screen.getByTestId('px-svg')).toBeInTheDocument();
    });

    const svg = container.querySelector('svg') as SVGElement | null;
    expect(svg).not.toBeNull();
    // width attribute = '100%' 로 override.
    expect(svg?.getAttribute('width')).toBe('100%');
    // height attribute 는 제거 (auto 비율 유지 위해).
    expect(svg?.hasAttribute('height')).toBe(false);
    // inline style 도 안전.
    expect(svg?.style.maxWidth).toBe('100%');
    expect(svg?.style.height).toBe('auto');
  });
});
