'use client';

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { GetPostType } from '@/types/posts.d';
import PostItem, { PostItemSkeleton } from '../components/post-item';

export interface InfinitPostListRef {
  getPrevPostId: (currentPostId: string) => string | null;
  getNextPostId: (currentPostId: string) => string | null;
  expandAll: () => void;
  collapseAll: () => void;
}

interface InfinitPostListProps {
  onTopmostVisiblePostChange?: (postId: string | null) => void;
  // The first page SSR-loaded on the server (page.tsx). When present, the initial CSR fetch is skipped.
  initialPosts?: GetPostType[];
  /**
   * The title search term (#232). A changed value refetches the list from the start.
   *
   * **It does not filter only what was loaded** - with infinite scroll 9 at a time that would make
   * "I searched and it is not there" false. The server searches the whole set.
   */
  query?: string;
}

// The component is wrapped in forwardRef to receive a ref from its parent.
const InfinitPostList = forwardRef<InfinitPostListRef, InfinitPostListProps>(({ onTopmostVisiblePostChange, initialPosts = [], query = '' }, ref) => {
  const [posts, setPosts] = useState<GetPostType[]>(initialPosts);
  // Stores a ref for each PostItem element.
  const postItemRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  // If SSR filled the first page, infinite scroll continues from page 2. Otherwise from 1, as before.
  const [page, setPage] = useState<number>(initialPosts.length > 0 ? 2 : 1);
  // Fewer initial items than the limit (9) means there are no more. Absent, or 9, leaves room to load more.
  const [hasMore, setHasMore] = useState(initialPosts.length === 0 || initialPosts.length >= 9);
  const [isLoading, setIsLoading] = useState(false); // 1. the loading state
  const loaderRef = useRef<HTMLDivElement>(null);

  // The state tracking which posts are open.
  const [openedPostIds, setOpenedPostIds] = useState<Set<string>>(new Set());
  // The mode controlling the open/closed state of every post.
  const [expansionMode, setExpansionMode] = useState<'expand' | 'collapse' | 'individual'>('individual');

  const fetchPosts = useCallback(async (page: number) => {
    // 1. Prevents a duplicate run while loading or when there are no more posts.
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    const res = await fetch(`/api/posts?page=${page}&limit=9${query ? `&q=${encodeURIComponent(query)}` : ''}`);
    const { data: { posts: newPosts } } = await res.json();
    setIsLoading(false);

    if (newPosts.length === 0) {
      setHasMore(false);
      return;
    }
    
    // Existing posts are updated with the latest information and new ones appended.
    // This is the most reliable way to keep the data current while avoiding duplicate 'key' errors.
    setPosts((prev) => {
      const postsMap = new Map(prev.map(p => [p._id, p]));
      newPosts.forEach((post: GetPostType) => {
        postsMap.set(post._id, post);
      });
      // Converts to an array while keeping the Map's order.
      return Array.from(postsMap.values());
    });

    // expansionMode decides the open state of the newly loaded posts.
    if (expansionMode === 'expand') {
      setOpenedPostIds(prev => {
        const newSet = new Set(prev);
        newPosts.forEach((p: GetPostType) => newSet.add(p._id));
        return newSet;
      });
    }
    setPage(page + 1);
  }, [hasMore, isLoading, expansionMode, query]);

  // A changed search term **replaces the list wholesale** (#232).
  //
  // Why fetchPosts is not reused: it blocks duplicates through isLoading/hasMore and **merges** its result
  // into the existing list. A new search must not merge, and right after the state reset those guards still
  // hold the old values, so the call is swallowed.
  //
  // `cancelled` stops **a late old response overwriting a newer result** while typing quickly.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/posts?page=1&limit=9${query ? `&q=${encodeURIComponent(query)}` : ''}`);
        const { data: { posts: found } } = await res.json();
        if (cancelled) return;
        setPosts(found);
        setPage(2);
        setHasMore(found.length >= 9);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [query]);

  // 2. the useEffect for the initial data load
  useEffect(() => {
    // When the component remounts (going back and so on), the initial load is skipped if posts already exist.
    if (posts.length === 0) {
      fetchPosts(1); // loading the first page
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // runs once, on component mount

  // The useEffect that tracks the post currently at the top of the screen
  useEffect(() => {
    // Without an onTopmostVisiblePostChange prop no observer is set up.
    if (!onTopmostVisiblePostChange) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const topEntry = entries
          .filter(entry => entry.isIntersecting)
          // 뷰포트 상단에 가장 가까운 엘리먼트를 찾습니다.
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

        if (topEntry) {
            onTopmostVisiblePostChange(topEntry.target.id);
        }
      },
      {
        // Intersection is judged against a line 0px from the viewport's top and -90% from its bottom.
        // That is, a post is detected as it enters the top 10% of the screen.
        rootMargin: '0px 0px -90% 0px',
        threshold: 0,
      }
    );

    // Every post item with a ref is observed whenever posts updates.
    const currentRefs = postItemRefs.current;
    currentRefs.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => {
        currentRefs.forEach((el) => {
            if (el) observer.unobserve(el);
        });
    };
  }, [posts, onTopmostVisiblePostChange]);

  // 3. the useEffect for the Intersection Observer
  useEffect(() => {
    const currentLoader = loaderRef.current;
    if (!currentLoader || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // The next page loads only when it is on screen and nothing is loading
        if (entries[0].isIntersecting && !isLoading) {
          fetchPosts(page);
        }
      },
      { threshold: 1 }
    );

    observer.observe(currentLoader);

    return () => {
      if (currentLoader) observer.unobserve(currentLoader);
    };
  }, [fetchPosts, hasMore, isLoading, page]); // isLoading added to the dependencies

  const togglePost = useCallback((id: string) => {
    setExpansionMode('individual'); // An individual toggle by the user switches to 'individual' mode
    setOpenedPostIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  // Finds the previous post's id from a post id
  const getPrevPostId = useCallback((currentPostId: string): string | null => {
    const currentIndex = posts.findIndex(post => post._id === currentPostId);
    if (currentIndex > 0) {
      return posts[currentIndex - 1]._id;
    }
    return null;
  }, [posts]);

    // Finds the next post's id from a post id
  const getNextPostId = useCallback((currentPostId: string): string | null => {
    const currentIndex = posts.findIndex(post => post._id === currentPostId);
    if (currentIndex > -1 && currentIndex < posts.length - 1) {
      return posts[currentIndex + 1]._id;
    }
    return null;
  }, [posts]);

  // Define functions to be exposed via ref
  const expandAll = useCallback(() => {
    setExpansionMode('expand');
    setOpenedPostIds(new Set(posts.map(post => post._id)));
  }, [posts]);

  const collapseAll = useCallback(() => {
    setExpansionMode('collapse');
    setOpenedPostIds(new Set());
  }, []);

  // Expose expandAll and collapseAll functions to the parent component
  useImperativeHandle(ref, () => ({
    getPrevPostId,
    getNextPostId,
    expandAll,
    collapseAll,
  }));

  // The initial loading state, defined explicitly
  const isInitialLoading = isLoading && posts.length === 0;

  return (
    <>
      <div className="grid grid-cols-1 gap-6">
        {isInitialLoading ? (
          // Renders the skeleton UI during the initial load
          Array.from({ length: 9 }).map((_, index) => <PostItemSkeleton key={index} />)
        ) : (
          posts.map((post) => {
            const isOpen = openedPostIds.has(post._id);
            // PostItem is wrapped in a div to carry the id and ref.
            return (
              <div
                key={post._id}
                id={post._id} // Assign id to the div wrapper
                ref={el => { postItemRefs.current.set(post._id, el); }}>
                <PostItem post={post} isOpen={isOpen} togglePost={togglePost} />
              </div>
            );
          })
        )}
      </div>
      {!isLoading && posts.length === 0 && query && (
        <div className="mt-6 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
          제목에 &lsquo;{query}&rsquo; 가 들어간 글이 없습니다.
        </div>
      )}
      {/* 4. 로딩 및 더보기 상태에 따른 UI 개선 */}
      {isLoading && !isInitialLoading && <div className="text-center mt-6 text-gray-400">로딩 중...</div>}
      {hasMore && !isLoading && <div ref={loaderRef} className="h-10" />}
    </>
  );
});

InfinitPostList.displayName = 'InfinitPostList';
export default InfinitPostList;
// This component fetches and displays a list of humorous posts with infinite scrolling.