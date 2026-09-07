'use client';

// Scrolling to the comment a notification came from (#241, #243).
//
// The link itself goes to `#comments-section` - the same **section anchor** as the main speech bubble, so the browser
// takes you there first. Here the query `?c=<comment id>` is read and, once that comment is drawn, it scrolls
// once more to it and highlights it briefly.
//
// Even when it is not found, **the section has already been reached.** There is no more ending up nowhere as before.
import { useEffect } from 'react';
import { targetCommentId, scrollTopFor } from '@/lib/comment-anchor';

/** The cap on observing when the comment never appears. A private post is drawn late on the client. */
const MAX_WAIT_MS = 5000;

/** Making where you landed noticeable - only briefly. */
const HIGHLIGHT_MS = 1600;

export default function CommentAnchor() {
  useEffect(() => {
    const targetId = targetCommentId(window.location.search);
    if (!targetId) return;

    let highlighted = false;
    const go = (el: HTMLElement) => {
      // Puts the comment's **top** two fifths down the screen (#255). scrollIntoView({block:'center'}) centres
      // the element, so a comment longer than the screen has its first line pushed above the top.
      window.scrollTo({
        top: scrollTopFor(el.getBoundingClientRect().top, window.scrollY, window.innerHeight),
        behavior: 'smooth',
      });
      if (highlighted) return;
      highlighted = true;
      el.classList.add('ring-2', 'ring-blue-400', 'rounded-lg');
      setTimeout(() => el.classList.remove('ring-2', 'ring-blue-400', 'rounded-lg'), HIGHLIGHT_MS);
    };

    // Once the body finishes rendering, images and rich content settle and push the layout. It aligns once
    // more then - otherwise the position aligned earlier drifts and the comment ends up off screen.
    const reposition = () => {
      const el = document.getElementById(targetId);
      if (el) go(el);
    };
    window.addEventListener('richContentRendered', reposition);

    let observer: MutationObserver | undefined;
    const existing = document.getElementById(targetId);
    if (existing) {
      go(existing);
    } else {
      observer = new MutationObserver(() => {
        const el = document.getElementById(targetId);
        if (el) { observer?.disconnect(); go(el); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    const timer = setTimeout(() => observer?.disconnect(), MAX_WAIT_MS);
    return () => {
      observer?.disconnect();
      clearTimeout(timer);
      window.removeEventListener('richContentRendered', reposition);
    };
  }, []);

  return null;
}
