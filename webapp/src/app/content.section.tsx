'use client';
import FloatingMenu from "@/app/floating-menu.section";
import InfinitPostList, { InfinitPostListRef } from "@/app/infinite-post.section";
import { GetPostType } from "@/types/posts.d";
import { useCallback, useEffect, useRef, useState } from "react";

export default function ContentSection({ initialPosts = [] }: { initialPosts?: GetPostType[] }) {
  const listRef = useRef<InfinitPostListRef>(null);
  const [topmostPostId, setTopmostPostId] = useState<string | null>(null);

  // Title search (#232). Tapping the title or the magnifier turns that spot into a search box.
  const [searchOpen, setSearchOpen] = useState(false);
  const [rawQuery, setRawQuery] = useState('');
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // The server is not hit on every keystroke - one request is sent 250ms after the typing stops.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(rawQuery.trim()), 250);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    // It must be typeable the moment it opens. Focus is given after the render.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Closing clears the search term - a filtered list left behind after closing reads as a bug.
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setRawQuery('');
    setQuery('');
  }, []);

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
          // 'block: start' scrolls so the element's top meets the viewport's top.
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
          // 'block: start' scrolls so the element's top meets the viewport's top.
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
        <div className="mb-4 flex items-center gap-2">
          {searchOpen ? (
            <>
              <input
                ref={inputRef}
                type="text"
                value={rawQuery}
                onChange={(event) => setRawQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Escape') closeSearch(); }}
                placeholder="제목으로 검색"
                aria-label="제목으로 검색"
                className="flex-1 min-w-0 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
              <button
                type="button"
                onClick={closeSearch}
                aria-label="검색 닫기"
                className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200">
                <button type="button" onClick={openSearch} className="hover:opacity-80 transition-opacity">
                  🔥 최신 유머
                </button>
              </h2>
              <button
                type="button"
                onClick={openSearch}
                aria-label="검색 열기"
                className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </button>
            </>
          )}
        </div>
        <InfinitPostList ref={listRef} initialPosts={initialPosts} onTopmostVisiblePostChange={setTopmostPostId} query={query} />
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
