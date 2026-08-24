'use client';

// 알림에서 온 덧글로 스크롤 (#241, #243).
//
// 링크 자체는 `#comments-section` 으로 간다 — 메인 말풍선과 같은 **섹션 앵커**라 브라우저가
// 먼저 그리로 데려다준다. 여기서는 쿼리 `?c=<덧글id>` 를 읽어, 그 덧글이 그려지면 거기까지
// 한 번 더 스크롤하고 잠깐 강조한다.
//
// 못 찾아도 **섹션에는 이미 도착해 있다.** 예전처럼 아무 데도 못 가는 일이 없다.
import { useEffect } from 'react';
import { targetCommentId } from '@/lib/comment-anchor';

/** 덧글이 안 나타날 때 관찰을 접는 상한. 비공개 글은 클라이언트에서 늦게 그려진다. */
const MAX_WAIT_MS = 5000;

/** 어디로 갔는지 눈에 띄게 — 잠깐만. */
const HIGHLIGHT_MS = 1600;

export default function CommentAnchor() {
  useEffect(() => {
    const targetId = targetCommentId(window.location.search);
    if (!targetId) return;

    let done = false;
    const go = (el: HTMLElement) => {
      if (done) return;
      done = true;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('ring-2', 'ring-blue-400', 'rounded-lg');
      setTimeout(() => el.classList.remove('ring-2', 'ring-blue-400', 'rounded-lg'), HIGHLIGHT_MS);
    };

    const existing = document.getElementById(targetId);
    if (existing) { go(existing); return; }

    const observer = new MutationObserver(() => {
      const el = document.getElementById(targetId);
      if (el) { observer.disconnect(); go(el); }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setTimeout(() => observer.disconnect(), MAX_WAIT_MS);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, []);

  return null;
}
