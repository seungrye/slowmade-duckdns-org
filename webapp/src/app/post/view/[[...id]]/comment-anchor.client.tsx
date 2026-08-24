'use client';

// 덧글 앵커로 스크롤 (#241).
//
// `/post/view/<글>#comment-<id>` 로 들어와도 그 덧글로 스크롤되지 않았다. 비공개 글은
// PrivatePostGate 가 클라이언트에서 나중에 그리므로, 브라우저가 해시로 점프하려는 순간
// 대상 요소가 아직 DOM 에 없다. 나중에 생겨도 브라우저는 다시 점프하지 않는다.
//
// 그래서 대상이 나타날 때까지 MutationObserver 로 지켜보다가, 생기면 한 번 스크롤하고 멈춘다.
// 이미 있으면 즉시. 최대 대기 시간을 두어 무한 관찰을 막는다.
import { useEffect } from 'react';
import { targetIdFromHash } from '@/lib/comment-anchor';

/** 대상이 안 나타날 때 관찰을 접는 상한. 렌더가 느려도 이 안에는 들어온다. */
const MAX_WAIT_MS = 5000;

export default function CommentAnchor() {
  useEffect(() => {
    const targetId = targetIdFromHash(window.location.hash);
    if (!targetId) return;

    let done = false;
    const scroll = (el: Element) => {
      if (done) return;
      done = true;
      el.scrollIntoView({ block: 'start' });
    };

    const existing = document.getElementById(targetId);
    if (existing) { scroll(existing); return; }

    const observer = new MutationObserver(() => {
      const el = document.getElementById(targetId);
      if (el) { scroll(el); observer.disconnect(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setTimeout(() => observer.disconnect(), MAX_WAIT_MS);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, []);

  return null;
}
