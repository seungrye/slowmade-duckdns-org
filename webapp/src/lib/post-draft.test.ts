// 글 작성 임시 저장 (#199) — 순수 부분.
//
// 저장소도 화면도 모른다. 여기서 지키는 것은 셋이다 —
//   1. 새 글과 수정 글의 초안이 **서로를 덮지 않는다**.
//   2. 깨진 값·오래된 값은 **조용히 버린다**(예외를 던져 글쓰기를 막으면 안 된다).
//   3. 너무 크면 저장하지 않는다(localStorage 는 넘치면 예외가 난다).
import { describe, it, expect } from 'vitest';
import { DRAFT_TTL_MS, MAX_DRAFT_BYTES, draftKey, parseDraft, serializeDraft, type PostDraft } from './post-draft';

const NOW = 1_800_000_000_000;
const draft = (over: Partial<PostDraft> = {}): PostDraft => ({
  title: '제목',
  tags: ['태그1', '태그2'],
  isPrivate: false,
  attachments: [{ id: 'a1', name: 'x.pdf', size: 10, mimeType: 'application/pdf' }],
  jsonContent: { type: 'doc', content: [] },
  uploadImageUrls: [],
  savedAt: NOW,
  ...over,
});

describe('draftKey', () => {
  it('새 글과 수정 글이 갈린다 — 서로를 덮으면 안 된다', () => {
    expect(draftKey()).not.toBe(draftKey('653f1a2b3c4d5e6f70819202'));
    expect(draftKey(undefined)).toBe(draftKey(''));
  });

  it('글마다 다르다', () => {
    expect(draftKey('a')).not.toBe(draftKey('b'));
  });
});

describe('serializeDraft / parseDraft', () => {
  it('왕복해도 값이 그대로', () => {
    const d = draft();
    const parsed = parseDraft(serializeDraft(d)!, NOW);
    expect(parsed).toEqual(d);
  });

  it('본문(JSON)도 그대로 살아 온다', () => {
    const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '안녕' }] }] };
    const parsed = parseDraft(serializeDraft(draft({ jsonContent: body }))!, NOW);
    expect(parsed!.jsonContent).toEqual(body);
  });

  // 오래된 글이 난데없이 되살아나는 편이 더 나쁘다.
  it('14일이 지나면 버린다', () => {
    const old = serializeDraft(draft({ savedAt: NOW - DRAFT_TTL_MS - 1 }))!;
    expect(parseDraft(old, NOW)).toBeNull();
  });

  it('딱 경계면 아직 살아 있다', () => {
    const edge = serializeDraft(draft({ savedAt: NOW - DRAFT_TTL_MS + 1 }))!;
    expect(parseDraft(edge, NOW)).not.toBeNull();
  });

  // 글쓰기를 막으면 안 된다 — 무슨 값이 들어 있어도 조용히 null.
  it('깨진 값은 예외 없이 null', () => {
    for (const raw of ['', '{', 'null', '[]', '"문자열"', '{"title":1}', '{}']) {
      expect(() => parseDraft(raw, NOW)).not.toThrow();
      expect(parseDraft(raw, NOW)).toBeNull();
    }
  });

  it('savedAt 이 없으면 버린다 — 나이를 알 수 없다', () => {
    const raw = JSON.stringify({ ...draft(), savedAt: undefined });
    expect(parseDraft(raw, NOW)).toBeNull();
  });

  it('빠진 필드는 안전한 기본값으로 채운다', () => {
    const raw = JSON.stringify({ title: '제목만', savedAt: NOW });
    const parsed = parseDraft(raw, NOW);
    expect(parsed).not.toBeNull();
    expect(parsed!.tags).toEqual([]);
    expect(parsed!.attachments).toEqual([]);
    expect(parsed!.isPrivate).toBe(false);
  });

  it('너무 크면 저장하지 않는다 — localStorage 가 넘치면 예외가 난다', () => {
    const huge = draft({ title: 'ㄱ'.repeat(MAX_DRAFT_BYTES) });
    expect(serializeDraft(huge)).toBeNull();
  });

  it('평범한 크기는 저장한다', () => {
    expect(serializeDraft(draft())).toBeTypeOf('string');
  });
});

describe('빈 초안 판별', () => {
  // 아무것도 안 쓴 상태를 저장해 두면, 다음에 들어올 때 "복원했습니다" 만 뜨고 내용은 없다.
  it('제목·본문·태그·첨부가 모두 비면 저장할 것이 없다', async () => {
    const { isEmptyDraft } = await import('./post-draft');
    expect(isEmptyDraft(draft({ title: '', tags: [], attachments: [], jsonContent: { type: 'doc', content: [] } }))).toBe(true);
    expect(isEmptyDraft(draft({ title: '' , tags: [], attachments: [] }))).toBe(true);
    expect(isEmptyDraft(draft())).toBe(false);
    expect(isEmptyDraft(draft({ title: '', tags: ['t'], attachments: [] }))).toBe(false);
  });
});
