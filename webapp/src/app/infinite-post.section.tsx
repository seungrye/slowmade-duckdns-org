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
  // 서버(page.tsx)에서 SSR 로드한 첫 페이지. 있으면 초기 CSR fetch 를 건너뛴다.
  initialPosts?: GetPostType[];
  /**
   * 제목 검색어 (#232). 값이 바뀌면 목록을 처음부터 다시 받는다.
   *
   * **불러온 것만 거르지 않는다** — 9건씩 무한스크롤이라 그러면 "검색했는데 없다"가
   * 거짓이 된다. 서버가 전체에서 찾는다.
   */
  query?: string;
}

// The component is wrapped in forwardRef to receive a ref from its parent.
const InfinitPostList = forwardRef<InfinitPostListRef, InfinitPostListProps>(({ onTopmostVisiblePostChange, initialPosts = [], query = '' }, ref) => {
  const [posts, setPosts] = useState<GetPostType[]>(initialPosts);
  // 각 PostItem 엘리먼트에 대한 ref를 저장합니다.
  const postItemRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  // SSR 로 첫 페이지가 채워졌으면 다음 무한스크롤은 2페이지부터. 없으면 기존대로 1부터.
  const [page, setPage] = useState<number>(initialPosts.length > 0 ? 2 : 1);
  // 초기값이 limit(9) 미만이면 더 없음. 없거나 9건이면 추가 로드 여지 있음.
  const [hasMore, setHasMore] = useState(initialPosts.length === 0 || initialPosts.length >= 9);
  const [isLoading, setIsLoading] = useState(false); // 1. 로딩 상태 추가
  const loaderRef = useRef<HTMLDivElement>(null);

  // 열려있는 게시물의 ID를 관리하는 상태
  const [openedPostIds, setOpenedPostIds] = useState<Set<string>>(new Set());
  // 전체 게시물의 열림/닫힘 상태를 제어하는 모드
  const [expansionMode, setExpansionMode] = useState<'expand' | 'collapse' | 'individual'>('individual');

  const fetchPosts = useCallback(async (page: number) => {
    // 1. 로딩 중이거나 더 이상 게시물이 없으면 중복 실행 방지
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    const res = await fetch(`/api/posts?page=${page}&limit=9${query ? `&q=${encodeURIComponent(query)}` : ''}`);
    const { data: { posts: newPosts } } = await res.json();
    setIsLoading(false);

    if (newPosts.length === 0) {
      setHasMore(false);
      return;
    }
    
    // 기존 게시물은 최신 정보로 업데이트하고, 새 게시물은 추가합니다.
    // 이 방식은 데이터의 최신 상태를 유지하면서 'key' 중복 오류를 방지하는 가장 안정적인 방법입니다.
    setPosts((prev) => {
      const postsMap = new Map(prev.map(p => [p._id, p]));
      newPosts.forEach((post: GetPostType) => {
        postsMap.set(post._id, post);
      });
      // Map의 순서를 유지하면서 배열로 변환합니다.
      return Array.from(postsMap.values());
    });

    // expansionMode에 따라 새로 로드된 게시물의 열림 상태를 결정합니다.
    if (expansionMode === 'expand') {
      setOpenedPostIds(prev => {
        const newSet = new Set(prev);
        newPosts.forEach((p: GetPostType) => newSet.add(p._id));
        return newSet;
      });
    }
    setPage(page + 1);
  }, [hasMore, isLoading, expansionMode, query]);

  // 검색어가 바뀌면 목록을 **통째로 갈아 끼운다** (#232).
  //
  // fetchPosts 를 재사용하지 않는 이유: 그쪽은 isLoading/hasMore 로 중복을 막고 결과를
  // 기존 목록에 **합친다**. 새 검색은 합치면 안 되고, 상태 초기화 직후엔 그 가드가 아직
  // 옛 값을 보고 있어 호출이 삼켜진다.
  //
  // `cancelled` 는 빠르게 타이핑할 때 **늦게 온 옛 응답이 새 결과를 덮는 것**을 막는다.
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

  // 2. 초기 데이터 로딩을 위한 useEffect
  useEffect(() => {
    // 뒤로가기 등으로 컴포넌트가 다시 마운트될 때, posts가 이미 있다면 초기 로딩을 건너뜁니다.
    if (posts.length === 0) {
      fetchPosts(1); // 첫 페이지 로드
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 컴포넌트 마운트 시 한 번만 실행

  // 현재 화면 상단의 게시물을 추적하기 위한 useEffect
  useEffect(() => {
    // onTopmostVisiblePostChange prop이 없으면 옵저버를 설정하지 않습니다.
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
        // 뷰포트 상단에서 0px, 하단에서 -90% 떨어진 지점을 기준으로 교차 여부를 판단합니다.
        // 즉, 게시물이 화면 상단 10% 영역에 들어올 때 감지합니다.
        rootMargin: '0px 0px -90% 0px',
        threshold: 0,
      }
    );

    // posts가 업데이트 될 때마다 ref가 있는 모든 post item을 관찰합니다.
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

  // 3. Intersection Observer를 위한 useEffect
  useEffect(() => {
    const currentLoader = loaderRef.current;
    if (!currentLoader || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // 화면에 보이고, 로딩 중이 아닐 때만 다음 페이지 로드
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
  }, [fetchPosts, hasMore, isLoading, page]); // isLoading을 의존성에 추가

  const togglePost = useCallback((id: string) => {
    setExpansionMode('individual'); // 사용자가 개별적으로 토글하면 'individual' 모드로 변경
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

  // 게시물 ID를 기반으로 이전 게시물의 ID를 찾는 함수
  const getPrevPostId = useCallback((currentPostId: string): string | null => {
    const currentIndex = posts.findIndex(post => post._id === currentPostId);
    if (currentIndex > 0) {
      return posts[currentIndex - 1]._id;
    }
    return null;
  }, [posts]);

    // 게시물 ID를 기반으로 다음 게시물의 ID를 찾는 함수
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

  // 초기 로딩 상태를 명확히 정의
  const isInitialLoading = isLoading && posts.length === 0;

  return (
    <>
      <div className="grid grid-cols-1 gap-6">
        {isInitialLoading ? (
          // 초기 로딩 시 스켈레톤 UI 렌더링
          Array.from({ length: 9 }).map((_, index) => <PostItemSkeleton key={index} />)
        ) : (
          posts.map((post) => {
            const isOpen = openedPostIds.has(post._id);
            // PostItem을 div로 감싸 id와 ref를 부여합니다.
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