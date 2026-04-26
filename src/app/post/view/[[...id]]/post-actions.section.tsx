'use client';

import { faEdit, faHistory, faRightFromBracket, faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '@/components/common/modal';

interface PostActionsProps {
  postId: string;
  authorEmail: string;
  onHistoryClick?: () => void;
  onBack?: () => void;
}

const DELETE_POST_COST = process.env.NEXT_PUBLIC_DELETE_POST_COST || 7;

export default function PostActions({ postId, authorEmail, onHistoryClick, onBack }: PostActionsProps) {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '삭제에 실패했습니다.');
      toast.success(result.message);
      router.push('/');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '삭제 중 오류가 발생했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-4 text-gray-500 dark:text-gray-400">
        {onBack && (
          <button
            onClick={onBack}
            className="hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
            aria-label="게시글로 돌아가기"
          >
            <FontAwesomeIcon icon={faRightFromBracket} />
          </button>
        )}
        {onHistoryClick && (
          <button
            onClick={onHistoryClick}
            className="hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
            aria-label="게시글 변경 이력 보기"
          >
            <FontAwesomeIcon icon={faHistory} />
          </button>
        )}
        {isAuthor && (
          <>
            <button
              onClick={() => router.push(`/post/write/${postId}`)}
              className="hover:text-blue-600 transition-colors"
              aria-label="게시글 수정"
            >
              <FontAwesomeIcon icon={faEdit} />
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className={`hover:text-red-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors ${isDeleting ? 'opacity-50' : ''}`}
              disabled={isDeleting}
              aria-label="게시글 삭제"
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </>
        )}
      </div>

      {isAuthor && (
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="게시물 삭제 확인">
          <div className="text-gray-700 dark:text-gray-300">
            <p>정말로 이 게시물을 삭제하시겠습니까?</p>
            <p className="text-sm text-red-600 mt-1">삭제 작업은 되돌릴 수 없으며, {DELETE_POST_COST}포인트가 차감됩니다.</p>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition" disabled={isDeleting}>취소</button>
            <button onClick={handleConfirmDelete} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition disabled:bg-red-400" disabled={isDeleting}>{isDeleting ? '삭제 중...' : '삭제 확인'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
