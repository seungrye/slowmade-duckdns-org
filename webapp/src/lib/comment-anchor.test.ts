// Jumping from a notification to a comment (#241, #243) - the pure part.
//
// It first targeted the individual comment with `#comment-<id>`, but a private post is rendered later on the client,
// so the target did not exist when the browser tried to jump.
//
// The speech bubble on the main screen (`post-item.tsx`) goes to `#comments-section` - **a section anchor**, so it
// does not depend on render timing. Notifications follow that, carrying the comment id as a query and scrolling once
// more to that comment after arriving. Even if it is not found, the section has already been reached.
import { describe, it, expect } from 'vitest';
import {
  notificationHref,
  targetCommentId,
  shouldScrollToSection,
  scrollTopFor,
  ANCHOR_VIEWPORT_RATIO,
} from './comment-anchor';

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

// Once the body has rendered (`richContentRendered`), the comment section reads the hash and scrolls to **the top of
// the section**. That ran **after** CommentAnchor's "centre on that comment" and overwrote it - which is why tapping
// a notification always landed at the start of the comment list (#247).
//
// With a destination set (`?c=`), the section scroll stands aside.
describe('shouldScrollToSection — 섹션 맨 위로 갈 것인가', () => {
  it('메인 말풍선처럼 해시만 있으면 섹션으로 간다', () => {
    expect(shouldScrollToSection('#comments-section', '')).toBe(true);
  });

  it('대상 덧글이 지정돼 있으면 비켜 준다 — 덮어쓰면 안 된다', () => {
    expect(shouldScrollToSection('#comments-section', '?c=abc')).toBe(false);
  });

  it('해시가 없으면 아무것도 하지 않는다', () => {
    expect(shouldScrollToSection('', '')).toBe(false);
    expect(shouldScrollToSection('#other', '')).toBe(false);
  });

  it('c 가 비어 있으면 대상이 없는 것이니 섹션으로 간다', () => {
    expect(shouldScrollToSection('#comments-section', '?c=')).toBe(true);
  });
});

// Where to stop (#255).
//
// It used to centre **the middle of the comment** with scrollIntoView({ block: 'center' }).
// A comment taller than the viewport then has its top pushed off screen - measured (1680x1000), the comment was 1154
// tall with a top of -77. The middle was exact while the first line sat above the screen.
//
// Now **the top of the box** is placed two fifths down the viewport. The upper 40% shows the preceding context, and
// the comment reads from its first line.
describe('scrollTopFor — 덧글 상단을 화면 2/5 지점에', () => {
  it('요소 상단이 화면 높이의 40% 지점에 오도록 계산한다', () => {
    // An element 300px into the viewport, scrolled to 500, viewport 1000 ->
    // document top 800, target 800 - 400 = 400.
    expect(scrollTopFor(300, 500, 1000)).toBe(400);
  });

  it('이미 원하는 위치면 움직이지 않는다', () => {
    expect(scrollTopFor(400, 500, 1000)).toBe(500);
  });

  // The element's height is not an argument at all - height dependence is exactly where the centre approach broke.
  it('덧글이 아무리 길어도 결과가 달라지지 않는다 (높이를 안 본다)', () => {
    expect(scrollTopFor(600, 1000, 1000)).toBe(1200);
  });

  it('문서 맨 위 근처면 0 아래로 내려가지 않는다', () => {
    // document top 300, target -100 -> nowhere further up, so 0.
    expect(scrollTopFor(300, 0, 1000)).toBe(0);
  });

  it('화면 높이에 비례한다 — 작은 화면에서도 같은 비율', () => {
    expect(scrollTopFor(0, 1000, 500)).toBe(800); // 1000 - 500*0.4
  });

  it('비율은 2/5', () => {
    expect(ANCHOR_VIEWPORT_RATIO).toBe(0.4);
  });
});
