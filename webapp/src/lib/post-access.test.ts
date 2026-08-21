// 봇 덧글 권한 (#205).
//
// enji·painter 라우트가 글을 **존재만** 확인하고 통과시켰다. 로그인만 했으면 남의 비공개 글에
// 덧글을 넣을 수 있었고, enji 는 그 본문 3000자를 Gemini 로 보냈다.
import { describe, it, expect } from 'vitest';
import { canCommentOn } from './post-access';

describe('canCommentOn', () => {
  const owner = 'me@x.test';
  const other = 'you@x.test';

  it('공개 글은 누구나 — 익명(비로그인) 덧글도 허용된 사이트다', () => {
    const post = { isPrivate: false, isDeleted: false, userEmail: owner };
    expect(canCommentOn(post, null)).toBe(true);
    expect(canCommentOn(post, other)).toBe(true);
  });

  // 이게 뚫렸던 지점이다.
  it('비공개 글은 본인만 — 타인은 거부', () => {
    const post = { isPrivate: true, isDeleted: false, userEmail: owner };
    expect(canCommentOn(post, other)).toBe(false);
    expect(canCommentOn(post, null)).toBe(false);
    expect(canCommentOn(post, owner)).toBe(true);
  });

  it('삭제된 글에는 덧글을 달 수 없다 — 본인만', () => {
    const post = { isPrivate: false, isDeleted: true, userEmail: owner };
    expect(canCommentOn(post, other)).toBe(false);
    expect(canCommentOn(post, owner)).toBe(true);
  });

  it('글이 없으면 거부 — 존재 여부도 알려 주지 않는다', () => {
    expect(canCommentOn(null, owner)).toBe(false);
    expect(canCommentOn(undefined, owner)).toBe(false);
  });

  it('isPrivate·isDeleted 가 없는 옛 문서는 공개', () => {
    expect(canCommentOn({ userEmail: owner }, null)).toBe(true);
  });

  // 세션 이메일이 비어 있을 때 userEmail 이 비어 있는 문서와 맞아떨어지면 안 된다.
  it('빈 이메일 세션을 소유자로 오인하지 않는다', () => {
    const post = { isPrivate: true, isDeleted: false, userEmail: '' };
    expect(canCommentOn(post, '')).toBe(false);
    expect(canCommentOn(post, null)).toBe(false);
  });
});
