'use client';
import FloatingMenu from "@/app/floating-menu.section";
import InfinitPostList, { InfinitPostListRef } from "@/app/infinite-post.section";
import { useCallback, useRef, useState } from "react";

export default function ContentSection() {
  const listRef = useRef<InfinitPostListRef>(null);
  const [topmostPostId, setTopmostPostId] = useState<string | null>(null);

  const handleExpandAll = useCallback(() => {
    listRef.current?.expandAll();
  }, []);

  const handleCollapseAll = useCallback(() => {
    listRef.current?.collapseAll();
  }, []);

  const handleScrollToPrev = useCallback(() => {
    if (!topmostPostId) {
      return console.warn("No topmost post ID available to scroll to the previous post.");
    }
    const prevPostId = listRef.current?.getPrevPostId(topmostPostId);
    if (prevPostId) {
      const prevPostElement = document.getElementById(prevPostId);
      if (prevPostElement) {
        requestAnimationFrame(() => {
          // 'block: start' 옵션으로 엘리먼트의 상단이 뷰포트의 상단에 오도록 스크롤합니다.
          prevPostElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    } else {
      requestAnimationFrame(() => {
        window.scrollTo({
          top: 0,
          behavior: 'smooth',
        });
      });
    }
  }, [topmostPostId]);

  const handleScrollToNext = useCallback(() => {
    if (!topmostPostId) {
      console.warn("No topmost post ID available to scroll to the next post.");
      // If there's no topmost post, just try to scroll to the bottom to load initial content if needed.
      requestAnimationFrame(() => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      });
      return;
    }

    const nextPostId = listRef.current?.getNextPostId(topmostPostId);
    if (nextPostId) {
      const nextPostElement = document.getElementById(nextPostId);
      if (nextPostElement) {
        requestAnimationFrame(() => {
          // 'block: start' 옵션으로 엘리먼트의 상단이 뷰포트의 상단에 오도록 스크롤합니다.
          nextPostElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    } else {
      // If at the end of the loaded list, scroll to the bottom of the page to trigger loading more posts.
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    }
  }, [topmostPostId]);

  return (
    <>
      <section className="mt-12">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">🔥 최신 유머</h2>
        <InfinitPostList ref={listRef} onTopmostVisiblePostChange={setTopmostPostId} />
      </section>

      {/* 우측 하단 플로팅 메뉴 */}
      <FloatingMenu
        onScrollToNext={handleScrollToNext}
        onScrollToPrev={handleScrollToPrev}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
      />
    </>
  );
}
