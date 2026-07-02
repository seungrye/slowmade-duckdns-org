import { vi, describe, it, expect, beforeEach } from 'vitest';

// updatePostViews 는 DB write 이므로 mock — route 가 올바른 id 로 호출하는지만 검증.
const mockUpdate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/posts', () => ({ updatePostViews: mockUpdate }));

import { POST } from './route';

function req(body: unknown): Request {
  return new Request('http://localhost/api/post/view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/post/view', () => {
  beforeEach(() => vi.clearAllMocks());

  it('id 로 조회수를 증가시키고 200 을 반환한다', async () => {
    const res = await POST(req({ id: 'abc123' }));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith('abc123');
  });

  it('id 가 없으면 400 이고 조회수를 증가시키지 않는다', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('id 가 문자열이 아니면 400', async () => {
    const res = await POST(req({ id: 123 }));
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('본문이 JSON 이 아니면 400', async () => {
    const bad = new Request('http://localhost/api/post/view', { method: 'POST', body: 'not-json' });
    const res = await POST(bad);
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
