'use client';

import { useState } from 'react';
import { JSONContent } from '@tiptap/react';
import { RichContentViewer } from '@/components/rich-web-editor/viewer';
import LikeSection from './like.section';
import Comments from './comments.section';
import PostActions from './post-actions.section';
import RevisionHistorySection from './revision-history.section';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

interface PostData {
  _id: string;
  title: string;
  jsonContent: unknown;
  likes: number;
  tags: string[];
  userEmail: string;
}

export default function PostViewContainer({ post }: { post: PostData }) {
  const [isHistoryView, setIsHistoryView] = useState(false);

  if (isHistoryView) {
    return (
      <RevisionHistorySection
        postId={post._id}
        authorEmail={post.userEmail}
        currentJsonContent={post.jsonContent}
        onBack={() => setIsHistoryView(false)}
      />
    );
  }

  return (
    <div className="mx-auto px-4 py-6">
      <div className="border border-gray-300 dark:border-gray-700 rounded-b-none rounded-lg mb-4 has-focus:shadow-sm">
        <div className="w-full p-3 flex justify-between items-center gap-4">
          <h1 className="font-bold md:text-lg truncate">{post.title}</h1>
          <div className="flex-shrink-0">
            <PostActions
              postId={post._id}
              authorEmail={post.userEmail}
              onHistoryClick={() => setIsHistoryView(true)}
            />
          </div>
        </div>
      </div>

      <div className="border border-gray-300 dark:border-gray-700 has-focus:shadow-sm rounded-b-lg min-h-[480px] rich-web-editor-wrapper flex flex-col">
        <div className="p-4 transition-all duration-300 ease-in-out flex-1">
          <RichContentViewer content={post.jsonContent as JSONContent} waitRenderComplete={true} />
        </div>

        {post.tags && post.tags.length > 0 && (
          <div className="p-3 text-sm text-gray-600 dark:text-gray-400 border-t border-t-gray-200 dark:border-t-gray-700">
            <div className="flex flex-wrap items-center gap-3">
              {post.tags.map((tag: string) => (
                <Link href={`/tags/${encodeURIComponent(tag)}`} key={tag}>
                  <Badge className="text-sm px-3 py-1 cursor-pointer"># {tag}</Badge>
                </Link>
              ))}
            </div>
          </div>
        )}

        <LikeSection defaultLikes={post.likes} _id={post._id} />
      </div>

      <div className="mt-6">
        <Comments postId={post._id} />
      </div>
    </div>
  );
}
