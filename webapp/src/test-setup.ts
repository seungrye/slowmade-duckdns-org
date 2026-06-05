import '@testing-library/jest-dom';

// jsdom 에는 ResizeObserver / DOMMatrix 가 없으나 @xyflow/react 가 마운트 시점에
// 참조한다. 빈 stub 으로 충분 — 테스트는 레이아웃 측정을 검증하지 않는다.
// (#222 — /scenes/graph ReactFlow 도입.)
class StubResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis !== 'undefined') {
  const g = globalThis as Record<string, unknown>;
  if (!g.ResizeObserver) g.ResizeObserver = StubResizeObserver;
  if (typeof window !== 'undefined') {
    const w = window as unknown as Record<string, unknown>;
    if (!w.ResizeObserver) w.ResizeObserver = StubResizeObserver;
  }
}
