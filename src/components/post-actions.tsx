'use client';

import { faEdit, faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
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
      const postData = {
        postId,
      }
      const response = await fetch(`/api/post`, {
        method: 'DELETE',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...postData,
        }),
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
    <div className="flex items-center gap-2">
      <Link href={`/post/write/${postId}`} className="text-blue-500 mt-2 block me-2 hover:text-red-700">
        <FontAwesomeIcon icon={faEdit} className="mr-1" />
      </Link>

      <span
        onClick={handleDelete}
        className={`text-blue-500 mt-2 block me-2 hover:text-red-700 disabled:text-red-400 disabled:cursor-not-allowed cursor-pointer ${isDeleting ? 'opacity-50' : ''}`}
        aria-label="게시글 삭제"
      >
        <FontAwesomeIcon icon={faTrash} className="mr-1" />
      </span>
    </div>
  );
}