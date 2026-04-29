'use client';

import { useState, useCallback } from 'react';
import PostItem from '@/components/post-item';
import { GetPostType } from '@/types/posts.d';

export default function TagPostList({ posts }: { posts: GetPostType[] }) {
  const [openedPostIds, setOpenedPostIds] = useState<Set<string>>(new Set());

  const togglePost = useCallback((id: string) => {
    setOpenedPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostItem
          key={post._id}
          post={post}
          isOpen={openedPostIds.has(post._id)}
          togglePost={togglePost}
        />
      ))}
    </div>
  );
}
