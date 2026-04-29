'use client';

import { faEdit, faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from './common/modal';

interface PostActionsProps {
  postId: string;
  authorEmail: string;
}

const DELETE_POST_COST = process.env.NEXT_PUBLIC_DELETE_POST_COST || 7; // 기본값을 7로 설정, 환경변수에서 가져오지 못할 경우를 대비

export default function PostActions({ postId, authorEmail }: PostActionsProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isAuthor = session?.user?.email === authorEmail;

  const handleConfirmDelete = async () => {
    setIsModalOpen(false);
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/post`, {
        method: 'DELETE',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId,
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
    <>
      <div className="flex items-center gap-2">
        <Link href={`/post/write/${postId}`} className="text-blue-500 mt-2 block me-2 hover:text-red-700" aria-label="게시글 수정">
          <FontAwesomeIcon icon={faEdit} className="mr-1" />
        </Link>

        <button
          onClick={() => setIsModalOpen(true)}
          className={`text-blue-500 mt-2 block me-2 hover:text-red-700 disabled:text-red-400 disabled:cursor-not-allowed cursor-pointer ${isDeleting ? 'opacity-50' : ''}`}
          disabled={isDeleting}
          aria-label="게시글 삭제"
        >
          <FontAwesomeIcon icon={faTrash} className="mr-1" />
        </button>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="게시물 삭제 확인"
      >
        <div className="text-gray-700 dark:text-gray-300">
          <p>정말로 이 게시물을 삭제하시겠습니까?</p>
          <p className="text-sm text-red-600 mt-1">
            삭제 작업은 되돌릴 수 없으며, {DELETE_POST_COST}포인트가 차감됩니다.
          </p>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition" disabled={isDeleting}
            aria-label="게시물 삭제 취소"
          >취소</button>
          <button onClick={handleConfirmDelete} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition disabled:bg-red-400" disabled={isDeleting}
            aria-label="게시물 삭제 확인"
          >{isDeleting ? '삭제 중...' : '삭제 확인'}</button>
        </div>
      </Modal>
    </>
  );
}