// 덧글 앵커로 스크롤 (#241) — 순수 부분.
//
// 알림에서 덧글을 눌러 `/post/view/<글>#comment-<id>` 로 가도 스크롤이 안 됐다. 비공개 글은
// 클라이언트에서 나중에 그려져서, 브라우저가 해시로 점프하려는 순간 그 요소가 DOM 에 없다.
// 그래서 "해시에서 어떤 요소를 기다려야 하나"를 먼저 순수 함수로 뽑아 테스트한다.
import { describe, it, expect } from 'vitest';
import { targetIdFromHash } from './comment-anchor';

describe('targetIdFromHash', () => {
  it('#comment-<id> 에서 요소 id 를 뽑는다', () => {
    expect(targetIdFromHash('#comment-abc123')).toBe('comment-abc123');
  });

  it('해시가 없으면 null', () => {
    expect(targetIdFromHash('')).toBeNull();
    expect(targetIdFromHash('#')).toBeNull();
  });

  // 덧글 앵커가 아닌 해시(다른 링크)에는 관여하지 않는다.
  it('comment- 로 시작하지 않으면 null', () => {
    expect(targetIdFromHash('#top')).toBeNull();
    expect(targetIdFromHash('#section-2')).toBeNull();
  });

  it('앞의 # 만 벗기고 나머지는 그대로 — id 에 하이픈이 여러 개여도', () => {
    expect(targetIdFromHash('#comment-6a8b-1f35-3ce0')).toBe('comment-6a8b-1f35-3ce0');
  });
});
