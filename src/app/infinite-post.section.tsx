'use client';

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle, useMemo } from 'react';
import { GetPostType } from '@/types/posts.d';
import PostItem from '../components/post-item';

export interface InfinitPostListRef {
  getPrevPostId: (currentPostId: string) => string | null;
  getNextPostId: (currentPostId: string) => string | null;
  expandAll: () => void;
  collapseAll: () => void;
}

interface InfinitPostListProps {
  onTopmostVisiblePostChange?: (postId: string | null) => void;
  onBottomVisiblePostChange?: (postId: string | null) => void;
}

// The component is wrapped in forwardRef to receive a ref from its parent.
const InfinitPostList = forwardRef<InfinitPostListRef, InfinitPostListProps>(({ onTopmostVisiblePostChange, onBottomVisiblePostChange }, ref) => {
  const [posts, setPosts] = useState<GetPostType[]>([]);
  // 각 PostItem 엘리먼트에 대한 ref를 저장합니다.
  const postItemRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState(true);
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
    const res = await fetch(`/api/posts?page=${page}&limit=3`);
    const { posts: newPosts } = await res.json();
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
  }, [hasMore, isLoading, expansionMode]);

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
    // onTopmostVisiblePostChange,onBottomVisiblePostChange prop이 없으면 옵저버를 설정하지 않습니다.
    if (!onTopmostVisiblePostChange || !onBottomVisiblePostChange) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // 뷰포트 상단에 가장 가까운 엘리먼트를 찾습니다.
        const topEntry = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

        if (topEntry) {
          onTopmostVisiblePostChange(topEntry.target.id);
        }

        // 뷰포트 하단에 가장 가까운 엘리먼트를 찾습니다.
        const bottomEntry = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => b.boundingClientRect.bottom - a.boundingClientRect.bottom)[0];

        if (bottomEntry) {
          onBottomVisiblePostChange(bottomEntry.target.id);
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
  }, [posts, onTopmostVisiblePostChange, onBottomVisiblePostChange]);

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

  return (
    <>
      <div className="grid grid-cols-1 gap-6">
        {posts.map((post) => {
          const isOpen = openedPostIds.has(post._id);
          // PostItem을 div로 감싸 id와 ref를 부여합니다.
          return (
            <div
              key={post._id}
              id={post._id}
              ref={el => postItemRefs.current.set(post._id, el)}>
              <PostItem post={post} isOpen={isOpen} togglePost={togglePost} />
            </div>
          );
        })}
      </div>
      {/* 4. 로딩 및 더보기 상태에 따른 UI 개선 */}
      {isLoading && <div className="text-center mt-6 text-gray-400">로딩 중...</div>}
      {hasMore && !isLoading && <div ref={loaderRef} className="h-10" />}
    </>
  );
});

InfinitPostList.displayName = 'InfinitPostList';
export default InfinitPostList;
// This component fetches and displays a list of humorous posts with infinite scrolling.