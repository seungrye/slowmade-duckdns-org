'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { GetPostType } from '@/types/posts.d';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { RichContentViewer } from '@/components/rich-web-editor/viewer';
import Link from 'next/link';

export default function InfinitPostList() {
  const [posts, setPosts] = useState<GetPostType[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false); // 1. 로딩 상태 추가
  const loaderRef = useRef<HTMLDivElement>(null);

  // 첫 로드 시에만 게시물을 열어두기 위한 상태
  const [openedPostIds, setOpenedPostIds] = useState<Set<string>>(new Set());

  const loadPosts = useCallback(async () => {
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

    setPosts((prev) => [...prev, ...newPosts]);
    setPage((prev) => prev + 1);

    // 첫 페이지 로드 시에만 모든 게시물을 열린 상태로 설정
    if (page === 1) {
      setOpenedPostIds(new Set(newPosts.map((post: GetPostType) => post._id)));
    }
  }, [page, hasMore, isLoading]);

  // 2. 초기 데이터 로딩을 위한 useEffect
  useEffect(() => {
    loadPosts();
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
          loadPosts();
        }
      },
      { threshold: 1 }
    );

    observer.observe(currentLoader);

    return () => {
      if (currentLoader) observer.unobserve(currentLoader);
    };
  }, [loadPosts, hasMore, isLoading]); // isLoading을 의존성에 추가

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

  return (
    <>
      <div className="grid grid-cols-1 gap-6">
        {posts.map((post) => {
          const isOpen = openedPostIds.has(post._id);
          return (
            <div key={post._id} className="bg-white rounded-lg shadow-sm hover:shadow-md inset-shadow-xs py-4">
              <div className="flex items-center justify-between px-4 pb-4 border-b border-b-gray-200">
                <Link href={`/post/view/${post._id}`} className='truncate'>
                  <h3 className="text-lg font-semibold truncate">{post.title}</h3>
                </Link>
                <button
                  onClick={() => togglePost(post._id)}
                  className="text-gray-500 hover:text-gray-700 transition ps-4 cursor-pointer grow text-right"
                  type="button"
                  aria-label="토글 열기/닫기"
                  aria-expanded={isOpen} // 5. 접근성 개선
                >
                  <FontAwesomeIcon icon={isOpen ? faChevronUp : faChevronDown} className="aspect-square w-6 h-6"/>
                </button>
              </div>
              {isOpen && (
                <div className="p-4 transition-all duration-300 ease-in-out">
                  <RichContentViewer content={post.htmlContent} />
                </div>
              )}
            {/* <p className="text-gray-500 text-sm">조회수 {formatNumber(post.views)} • 댓글 32</p>
             <Link href={`/humor/${post._id}`} className="text-blue-500 mt-2 block">더 보기 →</Link> */}
            </div>
          );
        })}
      </div>
      {/* 4. 로딩 및 더보기 상태에 따른 UI 개선 */}
      {isLoading && <div className="text-center mt-6 text-gray-400">로딩 중...</div>}
      {hasMore && !isLoading && <div ref={loaderRef} className="h-10" />}
    </>
  );
}
// This component fetches and displays a list of humorous posts with infinite scrolling.