// 글 작성 임시 저장 (#199) — 순수 부분. 저장소도 화면도 모른다.
//
// 글을 쓰다 페이지를 벗어나거나 새로고침하면 쓰던 내용이 전부 사라졌다. 브라우저에
// (localStorage) 담아 두었다가 돌아오면 되살린다.
//
// 여기서 지키는 것은 셋이다.
//   1. 새 글과 수정 글의 초안이 **서로를 덮지 않는다**.
//   2. 깨진 값·오래된 값은 **조용히 버린다** — 초안 때문에 글쓰기가 막히면 안 된다.
//   3. 너무 크면 저장하지 않는다 — localStorage 는 넘치면 예외를 던진다.

import type { JSONContent } from '@tiptap/react';

/** 오래된 초안이 난데없이 되살아나는 편이 더 나쁘다. */
export const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** localStorage 는 5MB 안팎이다. 한 초안이 그걸 다 먹지 않게 여유를 두고 자른다. */
export const MAX_DRAFT_BYTES = 1024 * 1024;

export interface DraftAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
}

/** 본문에 실린 업로드 이미지 — 에디터가 복원할 때 함께 넘겨야 한다(`{url, thumbnailUrl}`). */
export interface DraftImageUrl {
  // mongoose 스키마에서 온 값이라 `null` 이 섞일 수 있다 — 그대로 받아 그대로 돌려준다.
  url?: string | null;
  thumbnailUrl?: string | null;
}

export interface PostDraft {
  title: string;
  tags: string[];
  isPrivate: boolean;
  attachments: DraftAttachment[];
  /** 본문(Tiptap JSON). 에디터가 그대로 받아 준다. */
  jsonContent: JSONContent | null;
  uploadImageUrls: DraftImageUrl[];
  savedAt: number;
}

/** 새 글은 `new`, 수정 글은 그 id — 서로 다른 서랍을 쓴다. */
export function draftKey(postId?: string): string {
  return `post-draft:${postId || 'new'}`;
}

/** @returns 저장할 문자열. 너무 크면 `null`(저장을 건너뛴다). */
export function serializeDraft(draft: PostDraft): string | null {
  try {
    const raw = JSON.stringify(draft);
    return raw.length > MAX_DRAFT_BYTES ? null : raw;
  } catch {
    // 순환 참조 등 — 초안 하나 때문에 글쓰기가 멈추면 안 된다.
    return null;
  }
}

/**
 * 저장해 둔 문자열을 초안으로. **어떤 값이 들어와도 예외를 던지지 않는다** — 깨졌거나
 * 오래됐으면 `null`.
 */
export function parseDraft(raw: string | null | undefined, now: number): PostDraft | null {
  if (!raw) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;

  const o = obj as Record<string, unknown>;
  // 나이를 모르면 버린다 — 언제 것인지 모르는 초안을 되살릴 수는 없다.
  if (typeof o.savedAt !== 'number') return null;
  if (now - o.savedAt > DRAFT_TTL_MS) return null;
  // 제목이 문자열이 아니면 우리가 쓴 값이 아니다.
  if (typeof o.title !== 'string') return null;

  return {
    title: o.title,
    tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : [],
    isPrivate: o.isPrivate === true,
    attachments: Array.isArray(o.attachments) ? (o.attachments as DraftAttachment[]) : [],
    jsonContent: (o.jsonContent as JSONContent) ?? null,
    uploadImageUrls: Array.isArray(o.uploadImageUrls)
      ? o.uploadImageUrls.filter((u): u is DraftImageUrl => !!u && typeof u === 'object')
      : [],
    savedAt: o.savedAt,
  };
}

/** 본문에 글자가 하나라도 있나 — Tiptap 은 빈 문서도 `doc` 하나를 남긴다. */
function hasBody(json: JSONContent | null): boolean {
  if (!json) return false;
  const text = JSON.stringify(json.content ?? []);
  return /"text"\s*:\s*"[^"]/.test(text) || /"type"\s*:\s*"image"/.test(text);
}

/**
 * 저장할 것이 없는 초안인가.
 *
 * 빈 상태를 저장해 두면 다음에 들어올 때 "복원했습니다" 만 뜨고 내용은 없다 — 사용자에게는
 * 고장으로 보인다.
 */
export function isEmptyDraft(draft: PostDraft): boolean {
  return (
    !draft.title.trim() &&
    draft.tags.length === 0 &&
    draft.attachments.length === 0 &&
    !hasBody(draft.jsonContent)
  );
}
