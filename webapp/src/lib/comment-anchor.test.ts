// 알림에서 덧글로 이동 (#241, #243) — 순수 부분.
//
// 처음엔 `#comment-<id>` 로 개별 덧글을 직접 노렸는데, 비공개 글은 클라이언트에서 나중에
// 그려져 브라우저가 점프할 때 대상이 없었다.
//
// 메인 화면의 말풍선(`post-item.tsx`)은 `#comments-section` 으로 간다 — **섹션 앵커**라
// 렌더 타이밍을 타지 않는다. 알림도 그 방식을 따르고, 덧글 id 는 쿼리로 실어 보내
// 도착한 뒤 그 덧글까지 한 번 더 스크롤한다. 못 찾아도 섹션에는 이미 도착해 있다.
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

// 덧글 섹션은 본문 렌더가 끝나면(`richContentRendered`) 해시를 보고 **섹션 맨 위로**
// 스크롤한다. 그게 CommentAnchor 의 "그 덧글 가운데로" 보다 **나중에** 실행돼 덮어썼다 —
// 알림을 눌러도 늘 덧글 목록 처음으로 갔던 이유다 (#247).
//
// 갈 곳이 정해져 있으면(`?c=`) 섹션 스크롤은 비켜 준다.
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

// 어디에 멈출 것인가 (#255).
//
// 예전엔 scrollIntoView({ block: 'center' }) 로 **덧글의 가운데**를 화면 중앙에 맞췄다.
// 덧글이 화면보다 길면 상단이 화면 밖으로 밀린다 — 실측(1680×1000)에서 덧글 높이 1154,
// 덧글 top -77 이었다. 가운데는 정확히 맞았는데 정작 첫 줄이 화면 위에 있었다.
//
// 이제 **박스 상단**을 화면 높이의 2/5 지점에 놓는다. 위쪽 40% 로 앞 맥락이 보이고,
// 덧글은 첫 줄부터 읽힌다.
describe('scrollTopFor — 덧글 상단을 화면 2/5 지점에', () => {
  it('요소 상단이 화면 높이의 40% 지점에 오도록 계산한다', () => {
    // 화면 안 300px 지점에 있는 요소, 현재 500 스크롤, 화면 1000 →
    // 문서상 top 800, 목표는 800 - 400 = 400.
    expect(scrollTopFor(300, 500, 1000)).toBe(400);
  });

  it('이미 원하는 위치면 움직이지 않는다', () => {
    expect(scrollTopFor(400, 500, 1000)).toBe(500);
  });

  // 요소 높이는 인자에 아예 없다 — center 방식이 깨졌던 지점이 바로 높이 의존이었다.
  it('덧글이 아무리 길어도 결과가 달라지지 않는다 (높이를 안 본다)', () => {
    expect(scrollTopFor(600, 1000, 1000)).toBe(1200);
  });

  it('문서 맨 위 근처면 0 아래로 내려가지 않는다', () => {
    // 문서상 top 300, 목표 -100 → 더 올라갈 곳이 없으니 0.
    expect(scrollTopFor(300, 0, 1000)).toBe(0);
  });

  it('화면 높이에 비례한다 — 작은 화면에서도 같은 비율', () => {
    expect(scrollTopFor(0, 1000, 500)).toBe(800); // 1000 - 500*0.4
  });

  it('비율은 2/5', () => {
    expect(ANCHOR_VIEWPORT_RATIO).toBe(0.4);
  });
});
