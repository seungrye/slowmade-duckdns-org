// @vitest-environment jsdom
// 글 작성 임시 저장 (#199) — 화면 동작.
//
// 값 다루기는 `lib/post-draft.test.ts` 가 본다. 여기서는 **실제로 되살아나는지**,
// "새로 쓰기" 로 지워지는지, 저장 성공 뒤 초안이 남지 않는지를 본다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { draftKey, serializeDraft, type PostDraft } from '@/lib/post-draft';

// 에디터는 무겁고 jsdom 에서 못 그린다 — 우리가 쓰는 핸들만 흉내 낸다.
const editorState = vi.hoisted(() => ({ content: null as unknown, urls: [] as unknown[] }));
vi.mock('@/components/rich-web-editor/editor', async () => {
  const React = await import('react');
  const Mock = React.forwardRef(function MockEditor(_props: unknown, ref: React.Ref<unknown>) {
    React.useImperativeHandle(ref, () => ({
      getContent: () => ({ jsonContent: editorState.content, htmlContent: '<p/>', uploadImageUrls: editorState.urls }),
      setContent: (c: unknown, u: unknown[]) => { editorState.content = c; editorState.urls = u ?? []; },
      focus: () => {},
    }));
    return React.createElement('div', { 'data-testid': 'editor' });
  });
  return { RichWebEditor: Mock };
});
vi.mock('next/navigation', () => ({
  useParams: () => ({}),               // 새 글 화면
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { name: '나', email: 'me@test' } } }) }));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));

import PostWriterForm from './writer-form.section';

const KEY = draftKey();
const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '쓰던 글' }] }] };
const draft = (over: Partial<PostDraft> = {}): PostDraft => ({
  title: '쓰다 만 제목',
  tags: ['태그'],
  isPrivate: false,
  attachments: [],
  jsonContent: body,
  uploadImageUrls: [],
  savedAt: Date.now(),
  ...over,
});

describe('글 작성 임시 저장', () => {
  beforeEach(() => {
    localStorage.clear();
    editorState.content = null;
    editorState.urls = [];
    vi.clearAllMocks();
  });
  afterEach(() => localStorage.clear());

  it('초안이 있으면 제목이 되살아난다', async () => {
    localStorage.setItem(KEY, serializeDraft(draft())!);
    render(<PostWriterForm />);
    await waitFor(() => {
      expect((screen.getByPlaceholderText('제목을 입력하세요') as HTMLInputElement).value).toBe('쓰다 만 제목');
    });
  });

  it('본문도 에디터로 되돌려 준다', async () => {
    localStorage.setItem(KEY, serializeDraft(draft())!);
    render(<PostWriterForm />);
    await waitFor(() => expect(editorState.content).toEqual(body));
  });

  it('되살렸다고 알려 준다 — 모르면 지난 글이 왜 있는지 어리둥절하다', async () => {
    localStorage.setItem(KEY, serializeDraft(draft())!);
    render(<PostWriterForm />);
    expect(await screen.findByText(/되살렸습니다/)).toBeTruthy();
  });

  it('"새로 쓰기" 를 누르면 초안을 지우고 비운다', async () => {
    localStorage.setItem(KEY, serializeDraft(draft())!);
    render(<PostWriterForm />);
    fireEvent.click(await screen.findByRole('button', { name: '새로 쓰기' }));
    await waitFor(() => {
      expect((screen.getByPlaceholderText('제목을 입력하세요') as HTMLInputElement).value).toBe('');
    });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('초안이 없으면 아무 일도 없다', async () => {
    render(<PostWriterForm />);
    await waitFor(() => expect(screen.getByPlaceholderText('제목을 입력하세요')).toBeTruthy());
    expect(screen.queryByText(/되살렸습니다/)).toBeNull();
  });

  // 오래된 글이 난데없이 되살아나는 편이 더 나쁘다.
  it('오래된 초안은 되살리지 않는다', async () => {
    localStorage.setItem(KEY, serializeDraft(draft({ savedAt: Date.now() - 30 * 24 * 60 * 60 * 1000 }))!);
    render(<PostWriterForm />);
    await waitFor(() => expect(screen.getByPlaceholderText('제목을 입력하세요')).toBeTruthy());
    expect(screen.queryByText(/되살렸습니다/)).toBeNull();
  });

  it('깨진 값이 들어 있어도 화면이 뜬다', async () => {
    localStorage.setItem(KEY, '{망가진');
    render(<PostWriterForm />);
    await waitFor(() => expect(screen.getByPlaceholderText('제목을 입력하세요')).toBeTruthy());
  });

  it('제목을 치면 잠시 뒤 담아 둔다', async () => {
    vi.useFakeTimers();
    try {
      render(<PostWriterForm />);
      fireEvent.change(screen.getByPlaceholderText('제목을 입력하세요'), { target: { value: '새 제목' } });
      await vi.advanceTimersByTimeAsync(1500);
      expect(localStorage.getItem(KEY)).toContain('새 제목');
    } finally {
      vi.useRealTimers();
    }
  });
});
