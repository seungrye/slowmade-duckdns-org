'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import toast from 'react-hot-toast';

interface PostActionsProps {
  postId: string;
  authorEmail: string;
}

const DELETE_POST_COST = 100; // 게시글 삭제에 필요한 포인트

export default function PostActions({ postId, authorEmail }: PostActionsProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const isAuthor = session?.user?.email === authorEmail;

  const handleDelete = async () => {
    if (!window.confirm(`정말로 이 게시물을 삭제하시겠습니까? ${DELETE_POST_COST}포인트가 차감됩니다.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/posts/${postId}/delete`, {
        method: 'POST',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || '삭제에 실패했습니다.');
      }

      toast.success(result.message);
      router.refresh(); // 현재 페이지의 데이터를 새로고침하여 삭제된 게시물을 반영합니다.
    } catch (error) {
      const message = error instanceof Error ? error.message : '삭제 중 오류가 발생했습니다.';
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isAuthor) {
    return null;
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="px-3 py-1 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed flex-shrink-0"
    >
      {isDeleting ? '삭제 중...' : '삭제'}
    </button>
  );
}