'use client';

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { GetPostType } from '@/types/posts.d';
import PostItem from './post-item';

export interface InfinitPostListRef {
  expandAll: () => void;
  collapseAll: () => void;
}

// The component is wrapped in forwardRef to receive a ref from its parent.
const InfinitPostList = forwardRef<InfinitPostListRef, {}>((props, ref) => {
  const [posts, setPosts] = useState<GetPostType[]>([]);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false); // 1. 로딩 상태 추가
  const loaderRef = useRef<HTMLDivElement>(null);

  // 첫 로드 시에만 게시물을 열어두기 위한 상태
  const [openedPostIds, setOpenedPostIds] = useState<Set<string>>(new Set());

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
    setPage(page + 1);

    // 첫 페이지 로드 시에만 모든 게시물을 열린 상태로 설정
    if (page === 1) {
      setOpenedPostIds(new Set(newPosts.map((post: GetPostType) => post._id)));
    }
  }, [hasMore, isLoading]);

  // 2. 초기 데이터 로딩을 위한 useEffect
  useEffect(() => {
    // 뒤로가기 등으로 컴포넌트가 다시 마운트될 때, posts가 이미 있다면 초기 로딩을 건너뜁니다.
    if (posts.length === 0) {
      fetchPosts(1); // 첫 페이지 로드
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 컴포넌트 마운트 시 한 번만 실행

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

  const togglePost = (id: string) => {
    setOpenedPostIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Define functions to be exposed via ref
  const expandAll = useCallback(() => {
    setOpenedPostIds(new Set(posts.map(post => post._id)));
  }, [posts]);

  const collapseAll = useCallback(() => {
    setOpenedPostIds(new Set());
  }, []);

  // Expose expandAll and collapseAll functions to the parent component
  useImperativeHandle(ref, () => ({
    expandAll,
    collapseAll,
  }));

  return (
    <>
      <div className="grid grid-cols-1 gap-6">
        {posts.map((post) => {
          const isOpen = openedPostIds.has(post._id);
          return <PostItem key={post._id} post={post} isOpen={isOpen} togglePost={togglePost} />;
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