// @vitest-environment jsdom
// Draft autosave while writing (#199) - the screen behaviour.
//
// Handling the values is `lib/post-draft.test.ts`'s job. Here it is **whether it really comes back**,
// whether "start over" clears it, and whether no draft remains after a successful save.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { draftKey, serializeDraft, type PostDraft } from '@/lib/post-draft';

// The editor is heavy and cannot be drawn under jsdom - only the handles we use are imitated.
// The real editor is `immediatelyRender: false` and so is not ready on the first render. In that state
// setContent is silently ignored - that being the essence of this bug (#201), the mock imitates it too.
const editorState = vi.hoisted(() => ({ content: null as unknown, urls: [] as unknown[], ready: true }));
vi.mock('@/components/rich-web-editor/editor', async () => {
  const React = await import('react');
  const Mock = React.forwardRef(function MockEditor(_props: unknown, ref: React.Ref<unknown>) {
    React.useImperativeHandle(ref, () => ({
      isReady: () => editorState.ready,
      getContent: () => (editorState.ready
        ? { jsonContent: editorState.content, htmlContent: '<p/>', uploadImageUrls: editorState.urls }
        : { jsonContent: undefined, htmlContent: undefined, uploadImageUrls: [] }),
      // A call before readiness is **ignored**, as in reality - the essence of this bug (#201).
      setContent: (c: unknown, u: unknown[]) => {
        if (!editorState.ready) return;
        editorState.content = c; editorState.urls = u ?? [];
      },
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
vi.mock('@/lib/show-achievement-toast', () => ({ showAchievementToasts: vi.fn() }));

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
    editorState.ready = true;
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

  // An old post springing back out of nowhere is the worse outcome.
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

// #201 - the title came back but the body did not.
describe('에디터가 늦게 뜰 때 (#201)', () => {
  beforeEach(() => {
    localStorage.clear();
    editorState.content = null;
    editorState.urls = [];
    editorState.ready = false; // not ready yet on the first render
    vi.clearAllMocks();
  });

  it('에디터가 준비된 뒤에 본문을 넣는다', async () => {
    localStorage.setItem(KEY, serializeDraft(draft())!);
    render(<PostWriterForm />);

    // still not ready - the body has not gone in.
    await waitFor(() => expect(screen.getByPlaceholderText('제목을 입력하세요')).toBeTruthy());
    expect(editorState.content).toBeNull();

    editorState.ready = true;              // the editor has come up
    await waitFor(() => expect(editorState.content).toEqual(body), { timeout: 3000 });
  });

  // This was the more dangerous one - a loss with no way back.
  it('에디터가 없는 사이에 저장돼도 초안의 본문을 지우지 않는다', async () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem(KEY, serializeDraft(draft())!);
      render(<PostWriterForm />);
      // Restoring the title schedules a debounced save - and the editor is not there yet.
      await vi.advanceTimersByTimeAsync(1500);
      const saved = JSON.parse(localStorage.getItem(KEY)!);
      expect(saved.jsonContent).toEqual(body);
    } finally {
      vi.useRealTimers();
    }
  });
});

// -- once submitted, no draft should remain (#257) ----------------------
//
// The real symptom: after submitting a post normally, returning to the writer brought the just-published post
// back as "what you were writing". Reproduced on staging -
//   draft still there after submitting: true -> title: a post for checking draft cleanup
//   the new post's title field: "a post for checking draft cleanup"
//
// There are two causes. (1) the success path had no draft deletion. (2) a cleanup hook stores the draft
// when leaving the screen, so even after deleting it, navigating home **records what was just
// submitted** all over again. Deleting alone is not enough - the saving itself has to stop.
describe('제출 뒤 초안 정리 (#257)', () => {
  beforeEach(() => {
    localStorage.clear();
    editorState.content = null;
    editorState.urls = [];
    editorState.ready = true;   // this scenario is the ordinary state, with the editor up
    vi.clearAllMocks();
  });

  const okResponse = { ok: true, json: async () => ({ data: {} }) };

  async function writeAndSubmit(response: unknown = okResponse) {
    vi.stubGlobal('fetch', vi.fn(async () => response));
    editorState.content = body;
    // Submitting **with a draft actually present** is the only way to tell whether it gets cleared.
    // Without planting one, the debounced save has not fired by submit time and it just passes.
    localStorage.setItem(KEY, serializeDraft(draft())!);
    const view = render(<PostWriterForm />);
    await waitFor(() => expect(localStorage.getItem(KEY)).not.toBeNull());
    fireEvent.change(screen.getByPlaceholderText(/제목/), { target: { value: '올린 글' } });
    await act(async () => { fireEvent.click(screen.getByLabelText('Submit')); });
    return view;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('제출에 성공하면 초안을 지운다', async () => {
    await writeAndSubmit();
    await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull());
  });

  // This is the real cause - deleting alone brings it straight back as it navigates.
  it('제출 뒤 화면을 벗어나도 초안이 다시 생기지 않는다', async () => {
    const view = await writeAndSubmit();
    await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull());
    view.unmount();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('제출 뒤 탭을 숨겨도 다시 생기지 않는다', async () => {
    await writeAndSubmit();
    await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull());
    await act(async () => { window.dispatchEvent(new Event('pagehide')); });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  // Clearing the draft when the submit failed loses what was being written.
  it('제출에 실패하면 초안을 그대로 둔다', async () => {
    const view = await writeAndSubmit({ ok: false, json: async () => ({}) });
    view.unmount();
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });
});
