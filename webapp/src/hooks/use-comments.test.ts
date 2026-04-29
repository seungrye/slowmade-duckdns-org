// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('nanoid', () => ({ nanoid: () => 'test-anon-id' }));
vi.mock('@/lib/show-achievement-toast', () => ({
  showAchievementToasts: vi.fn(),
}));

import { useComments } from './use-comments';

const mockFetch = vi.fn();

describe('useComments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchComments', () => {
    it('댓글 목록을 불러와 comments 상태에 저장한다', async () => {
      const fakeComments = [{ _id: 'c1', content: '안녕' }];
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: fakeComments }),
      });

      const { result } = renderHook(() => useComments('post1'));

      await act(async () => {
        await result.current.fetchComments();
      });

      expect(result.current.comments).toEqual(fakeComments);
    });

    it('fetch 실패 시 comments를 변경하지 않는다', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));

      const { result } = renderHook(() => useComments('post1'));

      await act(async () => {
        await result.current.fetchComments();
      });

      expect(result.current.comments).toEqual([]);
    });
  });

  describe('submitComment', () => {
    it('내용이 빈 문자열이면 fetch를 호출하지 않고 false를 반환한다', async () => {
      const { result } = renderHook(() => useComments('post1'));

      let ok: boolean;
      await act(async () => {
        ok = await result.current.submitComment(null, '   ');
      });

      expect(ok!).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('성공 시 true를 반환한다', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { unlockedAchievements: [], pointsGained: 0 } }),
      });

      const { result } = renderHook(() => useComments('post1'));

      let ok: boolean;
      await act(async () => {
        ok = await result.current.submitComment(null, '좋은 글이에요');
      });

      expect(ok!).toBe(true);
    });

    it('응답이 ok가 아니면 false를 반환한다', async () => {
      mockFetch.mockResolvedValue({ ok: false });

      const { result } = renderHook(() => useComments('post1'));

      let ok: boolean;
      await act(async () => {
        ok = await result.current.submitComment(null, '내용');
      });

      expect(ok!).toBe(false);
    });

    it('anonid-token이 없으면 새로 생성하여 localStorage에 저장한다', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: {} }),
      });

      const { result } = renderHook(() => useComments('post1'));

      await act(async () => {
        await result.current.submitComment(null, '내용');
      });

      expect(localStorage.getItem('anonid-token')).toBe('test-anon-id');
    });

    it('parentId를 포함하여 API를 호출한다', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: {} }),
      });

      const { result } = renderHook(() => useComments('post1'));

      await act(async () => {
        await result.current.submitComment('parent123', '대댓글');
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.parentId).toBe('parent123');
      expect(body.postId).toBe('post1');
    });
  });

  describe('deleteComment', () => {
    it('성공 시 true를 반환한다', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const { result } = renderHook(() => useComments('post1'));

      let ok: boolean;
      await act(async () => {
        ok = await result.current.deleteComment('comment123');
      });

      expect(ok!).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/api/comments', expect.objectContaining({ method: 'DELETE' }));
    });

    it('실패 시 false를 반환한다', async () => {
      mockFetch.mockResolvedValue({ ok: false });

      const { result } = renderHook(() => useComments('post1'));

      let ok: boolean;
      await act(async () => {
        ok = await result.current.deleteComment('comment123');
      });

      expect(ok!).toBe(false);
    });

    it('fetch 에러 발생 시 false를 반환한다', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));

      const { result } = renderHook(() => useComments('post1'));

      let ok: boolean;
      await act(async () => {
        ok = await result.current.deleteComment('comment123');
      });

      expect(ok!).toBe(false);
    });
  });
});
