'use client';

import Link from 'next/link';
import { GetPostType } from '@/types/posts.d';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronUp, faComment, faEye, faHeart } from '@fortawesome/free-solid-svg-icons';
import dynamic from "next/dynamic";

const RichContentViewer = dynamic(
  () => import("@/components/rich-web-editor/viewer").then(mod => mod.RichContentViewer),
  { ssr: false }
);

interface PostItemProps {
  post: GetPostType;
  isOpen: boolean;
  togglePost: ((id: string) => void) | undefined;
}

export default function PostItem({ post, isOpen, togglePost }: PostItemProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm hover:shadow-md inset-shadow-xs">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <Link href={`/post/view/${post._id}`} className='truncate ' aria-label={`게시물 제목: ${post.title}`}>
          <h3 className="text-lg font-semibold truncate">{post.title}</h3>
        </Link>
        <button
          onClick={() => togglePost?.(post._id)}
          className={`text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition ps-4 ${!togglePost ? 'cursor-not-allowed' : 'cursor-pointer grow text-right'}`}
          type="button"
          aria-label="토글 열기/닫기"
          aria-expanded={isOpen}
          disabled={!togglePost}
          aria-disabled={!togglePost}
        >
          <FontAwesomeIcon icon={isOpen ? faChevronUp : faChevronDown} className="aspect-square w-6 h-6" />
        </button>
      </div>
      {isOpen && (
        <div className="border-t border-t-gray-200 dark:border-t-gray-700">
          <div className="relative max-h-64 overflow-hidden p-4">
            <RichContentViewer content={post.jsonContent} />
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white dark:from-gray-900 to-transparent pointer-events-none" />
          </div>
          <Link
            href={`/post/view/${post._id}`}
            className="flex justify-center py-2 text-xs text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors"
          >
            전체 보기
          </Link>
        </div>
      )}
      <div className="flex justify-between items-center px-4 py-3 text-sm text-gray-600 dark:text-gray-400 border-t border-t-gray-200 dark:border-t-gray-700">
        <div className="flex items-center cursor-pointer hover:text-blue-600">
          {/* 댓글 아이콘 링크에 해시 추가 */}
          <Link href={`/post/view/${post._id}#comments-section`} className="flex items-center gap-2">
            <FontAwesomeIcon icon={faComment} />
            <span>{post.commentCount || 0}</span>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <FontAwesomeIcon icon={faHeart} />
            <span>{post.likes || 0}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FontAwesomeIcon icon={faEye} />
            <span>{post.views || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PostItemSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg overflow-hidden shadow-sm hover:shadow-md inset-shadow-xs">
      <div className="animate-pulse">
        <div className="flex bg-gray-100 dark:bg-gray-800 items-center justify-between px-4 pt-4 pb-3">
          &nbsp;
        </div>
        <div className="flex justify-between items-center px-4 py-3 text-sm bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-t border-t-gray-200 dark:border-t-gray-700">
          &nbsp;
        </div>
      </div>
    </div>
  );
}