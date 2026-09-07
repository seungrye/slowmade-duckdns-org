// Revision read permissions (#168).
//
// A penetration test really did get through. Logged out,
//   GET /api/post/revisions?postId=<a private post>   -> exposed the title, author, time and version
//   GET /api/post/revision?revisionId=<that id>       -> exposed **the whole body (jsonContent)**
// Neither route had any authorisation check. Soft-deleted posts leaked with them.
import { describe, it, expect } from 'vitest';
import { canReadPostHistory } from './revisions-access';

describe('canReadPostHistory', () => {
  const owner = 'me@x.test';
  const other = 'you@x.test';

  it('공개 글은 누구나 — 비로그인도', () => {
    const post = { isPrivate: false, isDeleted: false, userEmail: owner };
    expect(canReadPostHistory(post, null)).toBe(true);
    expect(canReadPostHistory(post, other)).toBe(true);
  });

  // This is where it leaked.
  it('비공개 글은 본인만 — 비로그인·타인 모두 거부', () => {
    const post = { isPrivate: true, isDeleted: false, userEmail: owner };
    expect(canReadPostHistory(post, null)).toBe(false);
    expect(canReadPostHistory(post, other)).toBe(false);
    expect(canReadPostHistory(post, owner)).toBe(true);
  });

  // There is no reason for a deleted post's history to be visible to others.
  it('삭제된 글은 본인만', () => {
    const post = { isPrivate: false, isDeleted: true, userEmail: owner };
    expect(canReadPostHistory(post, null)).toBe(false);
    expect(canReadPostHistory(post, other)).toBe(false);
    expect(canReadPostHistory(post, owner)).toBe(true);
  });

  it('비공개이면서 삭제된 글도 본인만', () => {
    const post = { isPrivate: true, isDeleted: true, userEmail: owner };
    expect(canReadPostHistory(post, owner)).toBe(true);
    expect(canReadPostHistory(post, other)).toBe(false);
  });

  it('글이 없으면 거부 — 존재 여부도 알려 주지 않는다', () => {
    expect(canReadPostHistory(null, owner)).toBe(false);
    expect(canReadPostHistory(undefined, owner)).toBe(false);
  });

  // An older document missing the field counts as public (the schema's default says so).
  it('isPrivate·isDeleted 가 없는 옛 문서는 공개', () => {
    expect(canReadPostHistory({ userEmail: owner }, null)).toBe(true);
  });

  it('빈 이메일 세션을 소유자로 오인하지 않는다', () => {
    const post = { isPrivate: true, isDeleted: false, userEmail: '' };
    expect(canReadPostHistory(post, '')).toBe(false);
    expect(canReadPostHistory(post, null)).toBe(false);
  });
});
