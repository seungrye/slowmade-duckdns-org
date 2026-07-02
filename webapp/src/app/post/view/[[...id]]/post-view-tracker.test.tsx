// PostViewTracker: 뷰 페이지 마운트 시 조회수 API 를 1회 호출하는 client 컴포넌트.
// 렌더에서 조회수 write 를 분리해 page 를 ISR 캐싱 가능하게 만드는 축.
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import PostViewTracker from './post-view-tracker';

describe('PostViewTracker', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('마운트 시 /api/post/view 로 id 를 POST 한다', async () => {
    const f = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', f);

    render(<PostViewTracker id="abc123" />);

    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(f).toHaveBeenCalledWith('/api/post/view', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ id: 'abc123' });
  });

  it('리렌더에도 중복 호출하지 않는다 (ref 가드)', async () => {
    const f = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', f);

    const { rerender } = render(<PostViewTracker id="abc123" />);
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    rerender(<PostViewTracker id="abc123" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('fetch 실패해도 예외를 던지지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    expect(() => render(<PostViewTracker id="x" />)).not.toThrow();
  });

  it('DOM 에 아무 것도 렌더하지 않는다', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    const { container } = render(<PostViewTracker id="x" />);
    expect(container.innerHTML).toBe('');
  });
});
