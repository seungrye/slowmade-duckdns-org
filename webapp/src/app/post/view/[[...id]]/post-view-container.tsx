'use client';

import { useRef, useState } from 'react';
import { JSONContent } from '@tiptap/react';
import { RichContentViewer } from '@/components/rich-web-editor/viewer';
import LikeSection from './like.section';
import Comments from './comments.section';
import PostActions from './post-actions.section';
import RevisionHistorySection from './revision-history.section';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import PostScrollDepth from '@/components/post-scroll-depth';
import { MermaidPostEnhancer } from '@/components/mermaid-post-enhancer';

interface PostData {
  _id: string;
  title: string;
  jsonContent: unknown;
  likes: number;
  tags: string[];
  userEmail: string;
  author: string;
  createdAt: string;
}

export default function PostViewContainer({ post }: { post: PostData }) {
  const [isHistoryView, setIsHistoryView] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

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
    <article className="mx-auto px-4 py-6">
      <PostScrollDepth postId={post._id} postTitle={post.title} />
      <header className="border border-gray-300 dark:border-gray-700 rounded-b-none rounded-lg mb-4 has-focus:shadow-sm">
        {/*
          모바일(기본): 3행
            1행) 제목 (좌정렬, wrap 가능)
            2행) 날짜 · 작성자 (우정렬)
            3행) 히스토리/수정/삭제 (우정렬)
          데스크탑(md+): 1행 — 좌 제목 + 우 메타(날짜·이름·액션).
        */}
        <div className="w-full p-3 grid gap-2 md:gap-4 grid-cols-1 md:grid-cols-[1fr_auto] md:items-center">
          <h1 className="font-bold md:text-lg md:truncate">{post.title}</h1>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            <div className="flex items-center justify-end gap-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
              <time dateTime={post.createdAt}>
                {new Date(post.createdAt).toLocaleDateString('ko-KR')}
              </time>
              <address className="not-italic">
                <span>{post.author}</span>
              </address>
            </div>
            <div className="flex justify-end">
              <PostActions
                postId={post._id}
                authorEmail={post.userEmail}
                onHistoryClick={() => setIsHistoryView(true)}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="border border-gray-300 dark:border-gray-700 has-focus:shadow-sm rounded-b-lg min-h-[480px] rich-web-editor-wrapper flex flex-col">
        <div className="p-4 transition-all duration-300 ease-in-out flex-1" ref={bodyRef}>
          <RichContentViewer content={post.jsonContent as JSONContent} waitRenderComplete={true} />
          {/*
            mermaid 후처리 — TipTap viewer 가 렌더한 `<pre><code class="language-mermaid">` 를
            클라이언트 측에서 MermaidBlock 으로 교체. 본문(jsonContent) 변경 시 재실행.
          */}
          <MermaidPostEnhancer containerRef={bodyRef} contentKey={post._id} />
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
    </article>
  );
}
