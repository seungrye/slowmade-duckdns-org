'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { GetPostType } from '@/types/posts.d';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronUp, faComment, faThumbsUp, faThumbsDown, faEye } from '@fortawesome/free-solid-svg-icons';
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
    setPage((prev) => prev + 1);

    // 첫 페이지 로드 시에만 모든 게시물을 열린 상태로 설정
    if (page === 1) {
      setOpenedPostIds(new Set(newPosts.map((post: GetPostType) => post._id)));
    }
  }, [page, hasMore, isLoading]);

  // 2. 초기 데이터 로딩을 위한 useEffect
  useEffect(() => {
    // 뒤로가기 등으로 컴포넌트가 다시 마운트될 때, posts가 이미 있다면 초기 로딩을 건너뜁니다.
    if (posts.length === 0) {
      loadPosts();
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
            <div key={post._id} className="bg-white rounded-lg shadow-sm hover:shadow-md inset-shadow-xs">
              <div className="flex items-center justify-between px-4 pt-4 pb-3">
                <Link href={`/post/view/${post._id}`} className='truncate ' aria-label={`게시물 제목: ${post.title}`}>
                  <h3 className="text-lg font-semibold truncate">{post.title}</h3>
                </Link>
                <button
                  onClick={() => togglePost(post._id)}
                  className="text-gray-500 hover:text-gray-700 transition ps-4 cursor-pointer grow text-right"
                  type="button"
                  aria-label="토글 열기/닫기"
                  aria-expanded={isOpen} // 5. 접근성 개선
                >
                  <FontAwesomeIcon icon={isOpen ? faChevronUp : faChevronDown} className="aspect-square w-6 h-6" />
                </button>
              </div>
              {isOpen && (
                <div className="p-4 transition-all duration-300 ease-in-out border-t border-t-gray-200">
                  <RichContentViewer content={post.htmlContent} />
                </div>
              )}
              <div className="flex justify-between items-center px-4 py-2 text-sm text-gray-600 border-t border-t-gray-200">
                <div className="flex items-center cursor-pointer hover:text-blue-600" onClick={() => togglePost(post._id)}>
                  <Link href={`/post/view/${post._id}`} className="flex items-center gap-2">
                    <FontAwesomeIcon icon={faComment} />
                    <span>{post.commentCount || 0}</span>
                  </Link>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faThumbsUp} />
                    <span>{post.likes || 0}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faThumbsDown} />
                    <span>{post.dislikes || 0}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faEye} />
                    <span>{post.views || 0}</span>
                  </div>
                </div>
              </div>
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