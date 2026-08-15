// 리비전 열람 권한 (#168).
//
// 침투 테스트에서 실제로 뚫렸다. 비로그인으로
//   GET /api/post/revisions?postId=<비공개 글>   → 제목·작성자·시각·버전 노출
//   GET /api/post/revision?revisionId=<그 id>    → **본문(jsonContent) 전문** 노출
// 두 라우트에 인가 검사가 아예 없었다. 삭제(soft-delete)된 글도 같이 샜다.
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

  // 이게 뚫렸던 지점이다.
  it('비공개 글은 본인만 — 비로그인·타인 모두 거부', () => {
    const post = { isPrivate: true, isDeleted: false, userEmail: owner };
    expect(canReadPostHistory(post, null)).toBe(false);
    expect(canReadPostHistory(post, other)).toBe(false);
    expect(canReadPostHistory(post, owner)).toBe(true);
  });

  // 지운 글의 이력이 남에게 보일 이유가 없다.
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

  // 필드가 빠진 옛 문서는 공개로 본다(스키마 기본값이 그렇다).
  it('isPrivate·isDeleted 가 없는 옛 문서는 공개', () => {
    expect(canReadPostHistory({ userEmail: owner }, null)).toBe(true);
  });

  it('빈 이메일 세션을 소유자로 오인하지 않는다', () => {
    const post = { isPrivate: true, isDeleted: false, userEmail: '' };
    expect(canReadPostHistory(post, '')).toBe(false);
    expect(canReadPostHistory(post, null)).toBe(false);
  });
});
