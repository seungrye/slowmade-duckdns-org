// @vitest-environment jsdom
// 글 작성 임시 저장 (#199) — 화면 동작.
//
// 값 다루기는 `lib/post-draft.test.ts` 가 본다. 여기서는 **실제로 되살아나는지**,
// "새로 쓰기" 로 지워지는지, 저장 성공 뒤 초안이 남지 않는지를 본다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { draftKey, serializeDraft, type PostDraft } from '@/lib/post-draft';

// 에디터는 무겁고 jsdom 에서 못 그린다 — 우리가 쓰는 핸들만 흉내 낸다.
// 실제 에디터는 `immediatelyRender: false` 라 첫 렌더에 준비돼 있지 않다. 그 상태에서
// setContent 는 조용히 무시된다 — 이번 버그(#201)의 본질이라 목도 그렇게 흉내 낸다.
const editorState = vi.hoisted(() => ({ content: null as unknown, urls: [] as unknown[], ready: true }));
vi.mock('@/components/rich-web-editor/editor', async () => {
  const React = await import('react');
  const Mock = React.forwardRef(function MockEditor(_props: unknown, ref: React.Ref<unknown>) {
    React.useImperativeHandle(ref, () => ({
      isReady: () => editorState.ready,
      getContent: () => (editorState.ready
        ? { jsonContent: editorState.content, htmlContent: '<p/>', uploadImageUrls: editorState.urls }
        : { jsonContent: undefined, htmlContent: undefined, uploadImageUrls: [] }),
      // 준비 전 호출은 실제와 같이 **무시한다** — 이번 버그(#201)의 본질이다.
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

// #201 — 제목은 되살아나는데 본문은 안 되던 문제.
describe('에디터가 늦게 뜰 때 (#201)', () => {
  beforeEach(() => {
    localStorage.clear();
    editorState.content = null;
    editorState.urls = [];
    editorState.ready = false; // 첫 렌더에는 아직 준비되지 않았다
    vi.clearAllMocks();
  });

  it('에디터가 준비된 뒤에 본문을 넣는다', async () => {
    localStorage.setItem(KEY, serializeDraft(draft())!);
    render(<PostWriterForm />);

    // 아직 준비 전 — 본문은 들어가지 않았다.
    await waitFor(() => expect(screen.getByPlaceholderText('제목을 입력하세요')).toBeTruthy());
    expect(editorState.content).toBeNull();

    editorState.ready = true;              // 에디터가 떴다
    await waitFor(() => expect(editorState.content).toEqual(body), { timeout: 3000 });
  });

  // 이게 더 위험했다 — 되살릴 방법이 없는 손실이다.
  it('에디터가 없는 사이에 저장돼도 초안의 본문을 지우지 않는다', async () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem(KEY, serializeDraft(draft())!);
      render(<PostWriterForm />);
      // 제목이 복원되며 디바운스 저장이 걸린다 — 이때 에디터는 아직 없다.
      await vi.advanceTimersByTimeAsync(1500);
      const saved = JSON.parse(localStorage.getItem(KEY)!);
      expect(saved.jsonContent).toEqual(body);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ── 제출하고 나면 초안은 남지 않아야 한다 (#257) ────────────────────
//
// 실제 증상: 글을 정상 제출했는데 다시 글쓰기에 들어가면 방금 올린 글이
// "작성 중이던 내용" 으로 되살아났다. 스테이징 재현 결과 —
//   제출 후 초안 남아있나: true → 제목: 초안 정리 확인용 글
//   새 글쓰기 제목칸: "초안 정리 확인용 글"
//
// 원인이 둘이다. (1) 제출 성공 경로에 초안 삭제가 없었다. (2) 화면을 벗어날 때
// 초안을 담는 정리 훅이 있어서, 지우더라도 홈으로 이동하는 순간 **방금 제출한
// 내용이 다시 기록**된다. 그래서 지우는 것만으로는 안 되고 저장 자체를 멈춰야 한다.
describe('제출 뒤 초안 정리 (#257)', () => {
  beforeEach(() => {
    localStorage.clear();
    editorState.content = null;
    editorState.urls = [];
    editorState.ready = true;   // 이 시나리오는 에디터가 떠 있는 평범한 상태다
    vi.clearAllMocks();
  });

  const okResponse = { ok: true, json: async () => ({ data: {} }) };

  async function writeAndSubmit(response: unknown = okResponse) {
    vi.stubGlobal('fetch', vi.fn(async () => response));
    editorState.content = body;
    // 초안이 **실제로 있는 상태**에서 제출해야 지워지는지 알 수 있다.
    // 안 심어 두면 제출 시점에 아직 디바운스 저장이 안 돼 그냥 통과해 버린다.
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

  // 이쪽이 진짜 원인이다 — 지우기만 하면 이동하면서 곧바로 되살아난다.
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

  // 제출이 실패했는데 초안까지 지우면 쓰던 글이 사라진다.
  it('제출에 실패하면 초안을 그대로 둔다', async () => {
    const view = await writeAndSubmit({ ok: false, json: async () => ({}) });
    view.unmount();
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });
});
