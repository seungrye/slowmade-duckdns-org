// Post draft autosave (#199) - the pure part. It knows nothing of the store or the UI.
//
// Leaving the page or reloading while writing lost everything. It is now kept in the browser (localStorage) and
// restored on return.
//
// Three things are guaranteed here.
//   1. a new post's draft and an edit's draft **never overwrite each other**.
//   2. broken or stale values are **discarded quietly** - a draft must never block writing.
//   3. anything too large is not stored - localStorage throws when it overflows.

import type { JSONContent } from '@tiptap/react';

/** An old draft resurfacing out of nowhere is the worse outcome. */
export const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** localStorage is around 5MB. This leaves room so one draft cannot eat all of it. */
export const MAX_DRAFT_BYTES = 1024 * 1024;

export interface DraftAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
}

/** The uploaded images in the body - they must be handed back when the editor restores (`{url, thumbnailUrl}`). */
export interface DraftImageUrl {
  // The values come from a mongoose schema, so `null` can be mixed in - taken as is and returned as is.
  url?: string | null;
  thumbnailUrl?: string | null;
}

export interface PostDraft {
  title: string;
  tags: string[];
  isPrivate: boolean;
  attachments: DraftAttachment[];
  /** The body (Tiptap JSON). The editor takes it as is. */
  jsonContent: JSONContent | null;
  uploadImageUrls: DraftImageUrl[];
  savedAt: number;
}

/** `new` for a new post, or the post's id for an edit - they use different drawers. */
export function draftKey(postId?: string): string {
  return `post-draft:${postId || 'new'}`;
}

/** @returns the string to store, or `null` when it is too large (storing is skipped). */
export function serializeDraft(draft: PostDraft): string | null {
  try {
    const raw = JSON.stringify(draft);
    return raw.length > MAX_DRAFT_BYTES ? null : raw;
  } catch {
    // A circular reference and the like - one draft must never stop someone writing.
    return null;
  }
}

/**
 * A stored string back into a draft. **No value can make it throw** - broken or stale gives `null`.
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
  // Unknown age is discarded - a draft of unknown vintage cannot be restored.
  if (typeof o.savedAt !== 'number') return null;
  if (now - o.savedAt > DRAFT_TTL_MS) return null;
  // A non-string title is not a value we wrote.
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

/** Whether the body has any text at all - Tiptap leaves one `doc` even for an empty document. */
function hasBody(json: JSONContent | null): boolean {
  if (!json) return false;
  const text = JSON.stringify(json.content ?? []);
  return /"text"\s*:\s*"[^"]/.test(text) || /"type"\s*:\s*"image"/.test(text);
}

/**
 * Whether the draft has nothing worth storing.
 *
 * Storing an empty state means the next visit shows only "restored" with nothing in it - which reads as a bug.
 */
export function isEmptyDraft(draft: PostDraft): boolean {
  return (
    !draft.title.trim() &&
    draft.tags.length === 0 &&
    draft.attachments.length === 0 &&
    !hasBody(draft.jsonContent)
  );
}
