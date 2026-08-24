// 알림에서 덧글로 이동 (#241, #243) — 순수 부분.
//
// 처음엔 `#comment-<id>` 로 개별 덧글을 직접 노렸는데, 비공개 글은 클라이언트에서 나중에
// 그려져 브라우저가 점프할 때 대상이 없었다.
//
// 메인 화면의 말풍선(`post-item.tsx`)은 `#comments-section` 으로 간다 — **섹션 앵커**라
// 렌더 타이밍을 타지 않는다. 알림도 그 방식을 따르고, 덧글 id 는 쿼리로 실어 보내
// 도착한 뒤 그 덧글까지 한 번 더 스크롤한다. 못 찾아도 섹션에는 이미 도착해 있다.
import { describe, it, expect } from 'vitest';
import { notificationHref, targetCommentId } from './comment-anchor';

describe('notificationHref — 알림 항목이 가리키는 곳', () => {
  it('메인 말풍선과 같은 섹션 앵커로 간다', () => {
    expect(notificationHref('post1', 'c1')).toContain('#comments-section');
  });

  it('덧글 id 는 쿼리로 싣는다 — 도착한 뒤 그 덧글로 더 스크롤하려고', () => {
    expect(notificationHref('post1', 'c1')).toBe('/post/view/post1?c=c1#comments-section');
  });

  it('덧글 id 가 없으면 섹션까지만', () => {
    expect(notificationHref('post1', '')).toBe('/post/view/post1#comments-section');
  });

  it('id 를 URL 인코딩한다', () => {
    expect(notificationHref('p 1', 'c/1')).toBe('/post/view/p%201?c=c%2F1#comments-section');
  });
});

describe('targetCommentId — 쿼리에서 대상 덧글 뽑기', () => {
  it('c 파라미터를 요소 id 로 바꾼다', () => {
    expect(targetCommentId('?c=abc123')).toBe('comment-abc123');
  });

  it('c 가 없으면 null — 관여하지 않는다', () => {
    expect(targetCommentId('')).toBeNull();
    expect(targetCommentId('?other=1')).toBeNull();
  });

  it('빈 값이면 null', () => {
    expect(targetCommentId('?c=')).toBeNull();
  });

  it('인코딩된 값을 되돌린다', () => {
    expect(targetCommentId('?c=a%2Fb')).toBe('comment-a/b');
  });
});
