
'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { GetPostType } from '@/types/posts.d';
import { formatNumber } from '@/lib/format';

export default function InfiniteHumorList() {
  const [posts, setPosts] = useState<GetPostType[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);

  const loadPosts = useCallback(async () => {
    const res = await fetch(`/api/posts?page=${page}`);
    const data = await res.json();
    if (data.length === 0) {
      setHasMore(false);
      return;
    }
    setPosts((prev) => [...prev, ...data]);
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

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-1 gap-6">
        {posts.map((post) => (
          <div key={post._id} className="bg-white rounded-lg shadow-md p-4">
            <Image
              src={`/humor-default.jpg`}
              alt={post.title}
              width={300}
              height={200}
              className="rounded-md"
            />
            <h3 className="mt-3 text-lg font-semibold">{post.title}</h3>
            <p className="text-gray-500 text-sm">조회수 {formatNumber(post.views)} • 댓글 32</p>
            <Link href={`/humor/${post._id}`} className="text-blue-500 mt-2 block">더 보기 →</Link>
          </div>
        ))}
      </div>
      {hasMore && <div ref={loaderRef} className="text-center mt-6 text-gray-400">로딩 중...</div>}
    </>
  );
}
// This component fetches and displays a list of humorous posts with infinite scrolling.