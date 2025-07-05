'use client';

import Image from "next/image";
import Link from "next/link";
import { FaImage } from "react-icons/fa";
import { GetPostType } from "@/types/posts.d";
import PostActions from "@/components/post-actions";

interface MyPostCardProps {
  post: GetPostType;
}

export default function MyPostCard({ post }: MyPostCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-md inset-shadow-xs p-4 flex flex-col">
      {/* Image Section */}
      <Link href={`/post/view/${post._id}`} className="flex flex-col items-center justify-center h-[200px] max-h-[200px] overflow-hidden text-gray-400 mb-3">
        {post.urls?.[0]?.thumbnailUrl ? (
          <Image
            src={post.urls[0].thumbnailUrl}
            alt={post.title}
            width={300}
            height={200}
            priority
            className="rounded-md object-contain w-full h-auto"
          />
        ) : (
          <>
            <FaImage size={128} />
            <div className="text-sm mt-2">이미지가 없습니다</div>
          </>
        )}
      </Link>

      {/* Content Section */}
      <div className="flex-grow">
        <h4 className="text-lg font-semibold truncate">{post.title}</h4>
        <p className="text-gray-500 text-sm">조회수 {post.views} • 댓글 {post.commentCount || '0'}</p>
      </div>

      {/* Actions Section */}
      <div className="flex justify-between items-center mt-2">
        <Link href={`/post/write/${post._id}`} className="text-blue-500 hover:underline">수정 →</Link>
        <PostActions postId={post._id} authorEmail={post.userEmail} />
      </div>
    </div>
  );
}