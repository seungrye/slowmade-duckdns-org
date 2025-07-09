'use client';

import { Fragment, RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import toast, { Toaster } from "react-hot-toast";
import { CommentType } from "@/models/comment";
import { Manrope } from 'next/font/google';
import { nanoid } from "nanoid";
import { AchievementToast } from "../../../../components/achievement-toast";
import { AchievementType } from "@/models/achievement";

const manrope = Manrope({ subsets: ['latin'] });

type Props = { postId: string };

type Comment = CommentType & {
  _id: string  // InferSchemaType에는 이게 없음
  parent: string | null
  isDeleted?: boolean; // isDeleted 플래그 추가
  authorId?: { // populate를 통해 가져온 작성자 정보
    email: string;
    name: string;
  } | null;
}

export default function Comments({ postId }: Props) {
  const { data: session } = useSession();
  const [openReplyFor, setOpenReplyFor] = useState<string | null>(null); // 답글 작성 폼을 열 댓글 ID
  const [submitting, setSubmitting] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);

  const content = useRef<HTMLTextAreaElement>(null);
  const replyContent = useRef<HTMLTextAreaElement>(null);


  const fetchComments = useCallback(async () => {
    try {
      const response = await fetch(`/api/comments?postId=${postId}`);
      const data = await response.json();
      setComments(data);
    } catch (error) {
      console.error("Error fetching comments:", error);
    }
  }, [postId]);

  useEffect(() => {
    if (!submitting) fetchComments();
  }, [submitting, fetchComments]);

  const submitComment = useCallback(async (parentId: string | null = null, content: RefObject<HTMLTextAreaElement | null>) => {
    // 에디터에서 값 가져오기
    if (!content.current?.value.trim()) {
      return toast.error("덧글을 입력해주세요.");
    } else {
      setSubmitting(true);
    }

    let anonidToken = localStorage.getItem('anonid-token');
    if (!anonidToken) {
      anonidToken = nanoid(8); // 최초 방문자에게 고유 ID 생성
      localStorage.setItem('anonid-token', anonidToken);
    }

    try {
      const postData = {
        postId,
        parentId,
        content: content.current.value
      }
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...postData,
          anonid: anonidToken
        }),
      });

      if (response.ok) {
        const result = await response.json();
        toast.success("덧글이 성공적으로 작성되었습니다!");
        if (content.current) {
          content.current.value = "";
        }

        if (result.pointsGained > 0) {
            toast(`✨ ${result.pointsGained} 포인트를 획득했습니다!`);
        }

        if (result.unlockedAchievements && result.unlockedAchievements.length > 0) {
            result.unlockedAchievements.forEach((achievement: AchievementType, index: number) => {
                setTimeout(() => {
                    toast.custom((t) => (
                        <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} transition-all duration-300`}>
                            <AchievementToast achievement={achievement} />
                        </div>
                    ), { duration: 4000, id: achievement._id });
                }, index * 500); // 0.5초 간격으로 토스트 표시
            });
        }
        setOpenReplyFor(null); // 답글 작성 후 폼 닫기
      } else {
        toast.error("덧글 작성에 실패했습니다.");
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("덧글 작성에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }, [postId]);

  const handleDelete = useCallback(async (commentId: string) => {
    if (!confirm("정말로 이 댓글을 삭제하시겠습니까?")) {
      return;
    }

    try {
      const response = await fetch('/api/comments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId }),
      });

      if (response.ok) {
        toast.success('댓글이 삭제되었습니다.');
        fetchComments(); // 댓글 목록 새로고침
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || '댓글 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error("Error deleting comment:", error);
      toast.error('댓글 삭제 중 오류가 발생했습니다.');
    }
  }, [fetchComments]);

  const nestedComments = useCallback((parentId: string | null = null) => {
    if (comments.length === 0) return null;

    // console.log("comments", comments);
    // console.log("parentId", parentId);

    return comments
      .filter(c => c.parent === parentId)
      .map(c => (
        <Fragment key={c._id}>
          {c.isDeleted ? (
            // 삭제된 댓글 UI
            <div className={`${Boolean(parentId) ? "ml-6 md:ml-12 " : ""}border border-gray-200 rounded-lg rounded-br-none p-4`}>
              <p className="text-gray-500 italic">{c.content}</p>
            </div>
          ) : (
            // 정상 댓글 UI
            <div className={`${Boolean(parentId) ? "ml-6 md:ml-12 " : ""}flex items-start gap-4 border border-gray-200 rounded-lg rounded-br-none p-4`}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className={`font-medium text-gray-900 dark:text-white tracking-tighter ${manrope.className}`}>{c.author}</h3>
                  <span className="text-sm text-gray-500">·</span> {/* 가운데 점 */}
                  <span className="text-sm text-gray-500">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">
                  {c.content}
                </p>
                <button
                  className="text-sm text-blue-600 hover:underline mt-2"
                  onClick={() => setOpenReplyFor(prev => (prev === c._id ? null : c._id))}
                  aria-label="Open reply form"
                >
                  Reply
                </button>

                {/* 로그인한 사용자가 댓글 작성자일 경우 삭제 버튼 표시 */}
                {session?.user?.email === c.authorId?.email && (
                  <button
                    className="text-sm text-red-600 hover:underline mt-2 ml-4"
                    onClick={() => handleDelete(c._id)}
                  >
                    Delete
                  </button>
                )}

                {/* ✅ Reply form (열려있는 댓글일 때만 표시) */}
                {openReplyFor === c._id && (
                  <form className="mt-4 flex flex-col md:flex-row md:items-stretch md:gap-4">
                    <label htmlFor="comment" className="sr-only">
                      Add a comment
                    </label>
                    <textarea
                      id="comment"
                      rows={4}
                      className="min-h-20 block w-full p-3 text-sm text-gray-900 bg-gray-50 border border-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                      placeholder="Write your comment here..."
                      ref={replyContent} // 답글 폼 ref
                    ></textarea>
                    <button
                      type="submit"
                      className="mt-4 md:mt-0 inline-flex justify-end items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 dark:bg-blue-500 dark:hover:bg-blue-600"
                      onClick={() => submitComment(c._id, replyContent)} // 답글 작성 시 부모 댓글 ID 전달
                      disabled={submitting}
                      aria-label="Reply to comment"
                    > {/* 답글 작성 버튼 */}
                      Post comment
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {nestedComments(c._id)} {/* 대댓글 추가 UI 위치 */}
        </Fragment> // 단일 댓글 끝
      ));
  }, [comments, openReplyFor, submitting, submitComment, session, handleDelete]);



  return <>
    <Toaster position="bottom-right" /> {/* ✅ 토스트 메시지 표시 위치 */}

    <h2 className="text-xl font-semibold mb-2">{comments?.length || 0} 덧글</h2>

    {/* 댓글 목록 */}
    <div className="space-y-4">
      {nestedComments(null)}
    </div>

    {/* 댓글 작성 폼 */}
    <form className="mt-4 flex flex-col md:flex-row md:items-stretch md:gap-4">
      <label htmlFor="comment" className="sr-only">Add a comment</label>
      <textarea id="comment" rows={4} className="min-h-20 block w-full p-3 text-sm text-gray-900 bg-gray-50 border border-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white" placeholder="Write your comment here..." ref={content}></textarea>
      <button type="submit" className="mt-4 md:mt-0 inline-flex justify-end items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 dark:bg-blue-500 dark:hover:bg-blue-600"
        onClick={() => submitComment(null, content)} // 최상위 댓글 작성 시 부모 댓글 ID는 undefined
        disabled={submitting}
        aria-label="Post comment"
      > {/* 최상위 댓글 작성 버튼 */}

        Post comment
      </button>
    </form>
  </>
}