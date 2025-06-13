'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { GetPostType } from '@/types/posts.d';
import parse from 'html-react-parser';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';

export default function InfiniteHumorList() {
  const [posts, setPosts] = useState<GetPostType[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);

  // 기본적으로 모든 post가 열려 있음
  const [openedPostIds, setOpenedPostIds] = useState<Set<string>>(new Set());

  const loadPosts = useCallback(async () => {
    const res = await fetch(`/api/posts?page=${page}&limit=9`);
    const {posts} = await res.json();
    if (posts.length === 0) {
      setHasMore(false);
      return;
    }
    setPosts((prev) => [...prev, ...posts]);
    // 새로 가져온 게시물도 열려 있도록 추가
    setOpenedPostIds((prev) => {
      const newSet = new Set(prev);
      posts.forEach((post: GetPostType) => newSet.add(post._id));
      return newSet;
    });
    setPage((prev) => prev + 1);
  }, [page]);

  useEffect(() => {
    const currentLoader = loaderRef.current; // ← 복사본 저장

    if (!currentLoader || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadPosts();
        }
      },
      { threshold: 1 }
    );

    observer.observe(currentLoader);

    return () => {
      if (currentLoader) observer.unobserve(currentLoader); // ← 복사본 사용
    };
  }, [loadPosts, hasMore]);

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
            <div key={post._id} className="bg-white rounded-lg shadow-md inset-shadow-xs py-4">
              <div className="flex items-center justify-between px-4 pb-4 border-b border-b-gray-200">
                <h3 className="text-lg font-semibold">{post.title}</h3>
                <button
                  onClick={() => togglePost(post._id)}
                  className="text-gray-500 hover:text-gray-700 transition ps-4"
                  aria-label="토글 열기/닫기"
                >
                  <FontAwesomeIcon icon={isOpen ? faChevronUp : faChevronDown} />
                </button>
              </div>
              {isOpen && (
                <div className="p-4 transition-all duration-300 ease-in-out">
                  {parse(post.htmlContent || '')}
                </div>
              )}
            {/* <p className="text-gray-500 text-sm">조회수 {formatNumber(post.views)} • 댓글 32</p>
             <Link href={`/humor/${post._id}`} className="text-blue-500 mt-2 block">더 보기 →</Link> */}
            </div>
          );
        })}
      </div>
      {hasMore && <div ref={loaderRef} className="text-center mt-6 text-gray-400">로딩 중...</div>}
    </>
  );
}
// This component fetches and displays a list of humorous posts with infinite scrolling.