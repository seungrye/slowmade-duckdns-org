'use client';

import { Fragment, RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import toast, { Toaster } from "react-hot-toast";
import { CommentType } from "@/models/comment";
import { Manrope } from 'next/font/google';
import { nanoid } from "nanoid";
import { showAchievementToasts } from "@/lib/show-achievement-toast";

const manrope = Manrope({ subsets: ['latin'] });

type Props = { postId: string };

type Comment = CommentType & {
  _id: string  // InferSchemaType에는 이게 없음
  parent: { // populate를 통해 가져온 부모 댓글 정보
    _id: string;
    author: string;
  } | null;
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
  const commentRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());


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

  useEffect(() => {
    const handleRenderComplete = () => {
      if (window.location.hash !== '#comments-section') return;

      const element = document.getElementById('comments-section');
      if (element) {
        requestAnimationFrame(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    };

    window.addEventListener('richContentRendered', handleRenderComplete);

    return () => {
      window.removeEventListener('richContentRendered', handleRenderComplete);
    };
  }, []); // 컴포넌트 마운트 시 한 번만 실행

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

        showAchievementToasts(result);
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

  const handleParentAuthorClick = useCallback((parentId: string | null = null) => {
    if (!parentId) return console.log("parentId should not null");

    const parentElement = commentRefs.current.get(parentId);
    if (parentElement) {
      parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 스크롤 대상에 하이라이트 효과 추가
      parentElement.classList.add('highlight-scroll');
      setTimeout(() => {
        parentElement.classList.remove('highlight-scroll');
      }, 1500); // 1.5초 후 하이라이트 제거
    }
  }, []);

  const nestedComments = useCallback((parentId: string | null = null) => {
    if (comments.length === 0) return null;

    return comments
      .filter(c => {
        // 부모 ID가 일치하는 댓글을 필터링합니다.
        // c.parent는 populate된 객체일 수도 있고, null일 수도 있습니다.
        const currentParentId = c.parent ? c.parent._id : null;
        return currentParentId === parentId;
      })
      .map(c => (
        <Fragment key={c._id}>
          {c.isDeleted ? (
            // 삭제된 댓글 UI
            <div
              id={`comment-${c._id}`} // `id` 속성 추가
              ref={(el) => {
                if (el) commentRefs.current.set(c._id, el);
                else commentRefs.current.delete(c._id);
              }}
              className={`${Boolean(parentId) ? "ml-6 md:ml-12 " : ""}border border-gray-200 dark:border-gray-700 rounded-lg rounded-br-none p-4`}
            >
              <p className="text-gray-500 italic">{c.content}</p>
            </div>
          ) : (
            // 정상 댓글 UI
            <div
              id={`comment-${c._id}`}
              ref={(el) => {
                if (el) commentRefs.current.set(c._id, el);
                else commentRefs.current.delete(c._id);
              }}
              className={`${Boolean(parentId) ? "ml-6 md:ml-12 " : ""}flex items-start gap-4 border border-gray-200 dark:border-gray-700 rounded-lg rounded-br-none p-4 transition-all duration-300`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className={`font-medium text-gray-900 dark:text-white tracking-tighter ${manrope.className}`}>{c.author}</h3>
                  <span className="text-sm text-gray-500">·</span> {/* 가운데 점 */}
                  <span className="text-sm text-gray-500">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">
                  {c.parent && (
                    <a
                      href={`#comment-${c.parent._id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        handleParentAuthorClick(c.parent?._id);
                      }}
                      className="text-blue-600 hover:underline mr-2 p-1 bg-blue-50 dark:bg-blue-900/30 rounded-md"
                      aria-label={`부모 댓글로 이동: @${c.parent.author}`}
                    >
                      {c.parent.author}
                    </a>
                  )}
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
  }, [comments, openReplyFor, submitting, submitComment, session, handleDelete, handleParentAuthorClick]);



  return <section id="comments-section">
    <Toaster position="bottom-right" /> {/* ✅ 토스트 메시지 표시 위치 */}
    <style jsx global>{`
      .highlight-scroll {
        animation: highlight-animation 1.5s ease-out;
      }
      @keyframes highlight-animation {
        0% { background-color: rgba(59, 130, 246, 0.3); }
        100% { background-color: transparent; }
      }
      .dark .highlight-scroll {
        animation: highlight-animation-dark 1.5s ease-out;
      }
      @keyframes highlight-animation-dark {
        0% { background-color: rgba(59, 130, 246, 0.4); }
        100% { background-color: transparent; }
      }
    `}</style>

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
  </section>
}
